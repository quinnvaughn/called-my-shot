import { and, desc, eq, inArray, lt, type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import { type TeamSeasonStats, teamSeasonStats } from "../../db/schema"
import { parseTeamRecord, recordGames } from "../team-record"
import type { StatContextQuestion, SubjectRef } from "./build"
import { derivedDifferentialFrom, differentialFrom } from "./differential"
import type {
	StatContextMatchup,
	StatContextMatchupSide,
	StatContextMeeting,
	StatContextOutcome,
	StatContextRecord,
	StatContextResult,
	StatContextSplitRecord,
	StatContextStreak,
} from "./types"

// The only queries in this directory that read `games` rather than the stored
// box scores. A who-wins question settles off games.home_score/away_score
// (resolveGameWinner, db/sync/sync-games.ts) and never off a box-score column,
// so reading `games` here is what makes the card and the settled result the
// same number by construction - the same guarantee boxStatSourceFor enforces
// for every stat-backed shape, reached by the route this shape actually takes.

// Prior meetings are a footnote under the two columns, not a table. Five is
// more than a season of any league synced here will produce anyway.
const MEETING_LIMIT = 5

// Whole days. A 1pm Sunday into an 8:20pm Sunday is 7 days of rest, not 7.3,
// and no league's short-week distinction turns on hours.
const MS_PER_DAY = 86_400_000

export type MatchupScope = {
	seasonId: string
	// The two sides. Both legs below filter on this list, so a game the two of
	// them played against each other comes back once per side.
	teamIds: string[]
	// The question's lock time. Strictly before it, the same rule every
	// box-score query follows: a resolved question's page has to show the
	// pregame picture, not one contaminated by the game being asked about.
	asOf: Date
	// That game, left out by identity as well as by time. A question that locks
	// after kickoff, or a game whose start time was corrected backwards, would
	// otherwise fold its own answer back in as context.
	excludeGameId: string
}

export type CompletedGame = {
	teamId: string
	gameId: string
	date: Date
	isHome: boolean
	opponentTeamId: string
	opponentAbbreviation: string
	pointsFor: number
	pointsAgainst: number
	postseason: boolean
}

// Both halves of the season. Which figures each half feeds is buildMatchup's
// call, not this query's: season figures stay on the regular season, form and
// head to head run through the playoffs.
function completed(scope: MatchupScope): SQL {
	return sql`
		and g.season_id = ${scope.seasonId}
		and g.status = 'final'
		and g.home_score is not null
		and g.away_score is not null
		and g.starts_at < ${scope.asOf}
		and g.id <> ${scope.excludeGameId}
	`
}

// Every completed game either side has played this season, normalised to that
// side's own point of view - their points first, the other team as opponent.
//
// Two legs rather than one or-ed predicate, for two reasons. Each leg is a
// plain range scan on its own (team, starts_at) index. And when the two sides
// have already played each other, the union returns that game twice, once from
// each side's view with the right is_home on each - which is exactly what both
// records need, and what a single or-ed row would have to be fanned back out
// into here anyway.
export async function completedGames(
	scope: MatchupScope,
): Promise<CompletedGame[]> {
	if (scope.teamIds.length === 0) return []

	const { rows } = await db.execute<{
		team_id: string
		game_id: string
		starts_at: Date
		is_home: boolean
		opponent_team_id: string
		opponent_abbreviation: string
		points_for: number
		points_against: number
		postseason: boolean
	}>(sql`
		select
			g.home_team_id as team_id,
			g.id as game_id,
			g.starts_at as starts_at,
			true as is_home,
			g.away_team_id as opponent_team_id,
			o.abbreviation as opponent_abbreviation,
			g.home_score as points_for,
			g.away_score as points_against,
			g.season_type = 'postseason' as postseason
		from games g
		join teams o on o.id = g.away_team_id
		where g.home_team_id in ${scope.teamIds}
			${completed(scope)}
		union all
		select
			g.away_team_id,
			g.id,
			g.starts_at,
			false,
			g.home_team_id,
			o.abbreviation,
			g.away_score,
			g.home_score,
			g.season_type = 'postseason'
		from games g
		join teams o on o.id = g.home_team_id
		where g.away_team_id in ${scope.teamIds}
			${completed(scope)}
		order by starts_at desc, game_id
	`)

	return rows.map((row) => ({
		teamId: row.team_id,
		gameId: row.game_id,
		date: new Date(row.starts_at),
		isHome: row.is_home,
		opponentTeamId: row.opponent_team_id,
		opponentAbbreviation: row.opponent_abbreviation,
		pointsFor: Number(row.points_for),
		pointsAgainst: Number(row.points_against),
		postseason: row.postseason,
	}))
}

function outcomeOf(pointsFor: number, pointsAgainst: number): StatContextOutcome {
	if (pointsFor > pointsAgainst) return "win"
	if (pointsFor < pointsAgainst) return "loss"
	return "tie"
}

function toResult(row: CompletedGame): StatContextResult {
	return {
		gameId: row.gameId,
		date: row.date,
		opponentTeamId: row.opponentTeamId,
		opponentAbbreviation: row.opponentAbbreviation,
		isHome: row.isHome,
		pointsFor: row.pointsFor,
		pointsAgainst: row.pointsAgainst,
		outcome: outcomeOf(row.pointsFor, row.pointsAgainst),
	}
}

// One pass over the games behind it. ouLine is the game total's line, counted
// against each game's combined score - null for a who-wins question, which has
// no line and gets no count.
function recordOf(
	results: StatContextResult[],
	ouLine: number | null,
): StatContextRecord | null {
	if (results.length === 0) return null

	let wins = 0
	let losses = 0
	let ties = 0
	let pointsFor = 0
	let pointsAgainst = 0
	let overLine = 0
	for (const result of results) {
		if (result.outcome === "win") wins++
		else if (result.outcome === "loss") losses++
		else ties++
		pointsFor += result.pointsFor
		pointsAgainst += result.pointsAgainst
		if (ouLine !== null && result.pointsFor + result.pointsAgainst > ouLine) {
			overLine++
		}
	}

	const games = results.length
	return {
		games,
		wins,
		losses,
		ties,
		pointsForPerGame: pointsFor / games,
		pointsAgainstPerGame: pointsAgainst / games,
		overLine: ouLine === null ? null : overLine,
	}
}

function splitOf(results: StatContextResult[]): StatContextSplitRecord | null {
	const record = recordOf(results, null)
	if (!record) return null
	const { games, wins, losses, ties } = record
	return { games, wins, losses, ties, otLosses: null }
}

// The last standings reading taken before this question locked, per team. A
// current row is deliberately not acceptable: standings move, and a resolved
// question's card showing today's figures would be showing one that contains
// the game it was asking about.
async function standingsAsOf(
	teamIds: string[],
	seasonId: string,
	asOf: Date,
): Promise<Map<string, TeamSeasonStats>> {
	if (teamIds.length === 0) return new Map()

	const rows = await db
		.select()
		.from(teamSeasonStats)
		.where(
			and(
				inArray(teamSeasonStats.teamId, teamIds),
				eq(teamSeasonStats.seasonId, seasonId),
				lt(teamSeasonStats.asOf, asOf),
			),
		)
		.orderBy(desc(teamSeasonStats.asOf))

	// Ordered newest first, so the first row seen for a team is its latest
	// reading before the lock.
	const latest = new Map<string, TeamSeasonStats>()
	for (const row of rows) {
		if (!latest.has(row.teamId)) latest.set(row.teamId, row)
	}
	return latest
}

// How many games a "last ten" has to stand on before it can be called one.
const LAST_TEN = 10

// ESPN writes a record split as display text ("8-2", "12-4-1", the NHL's
// "7-2-1, 0 PTS"). Null when it has no games behind it yet, or isn't in that
// form.
function parseRecordText(
	text: string | null,
	leagueSlug: string,
): StatContextSplitRecord | null {
	const record = parseTeamRecord(text, leagueSlug)
	if (!record) return null
	const games = recordGames(record)
	return games === 0 ? null : { games, ...record }
}

// ESPN writes a streak as display text ("W3", "L1"). Parsed into the same shape
// the derived one uses so the page never has to tell them apart. Null when
// there is no streak yet or the text isn't in that form.
function parseStreak(text: string | null): StatContextStreak | null {
	const match = /^([WLT])(\d+)$/.exec((text ?? "").trim().toUpperCase())
	if (!match) return null
	const length = Number(match[2])
	if (!Number.isFinite(length) || length < 1) return null
	const outcome =
		match[1] === "W" ? "win" : match[1] === "L" ? "loss" : "tie"
	return { outcome, length }
}

// Results arrive most recent first, so the streak is however far the run at the
// head of the list extends.
function streakOf(results: StatContextResult[]): StatContextStreak | null {
	const latest = results[0]
	if (!latest) return null

	let length = 0
	for (const result of results) {
		if (result.outcome !== latest.outcome) break
		length++
	}
	return { outcome: latest.outcome, length }
}

function restDaysBefore(
	startsAt: Date,
	results: StatContextResult[],
): number | null {
	const previous = results[0]
	if (!previous) return null
	return Math.round((startsAt.getTime() - previous.date.getTime()) / MS_PER_DAY)
}

// Every meeting, read off the rows already fetched from one side's view, then
// rewritten to the home/away of the meeting itself. Capped by the caller, not
// here, because the series record counts all of them. The two sides swap venue between
// meetings, so forcing them into this game's order would misreport where a
// previous one was played.
function meetingsBetween(
	rows: CompletedGame[],
	teamId: string,
	opponentTeamId: string,
): StatContextMeeting[] {
	return rows
		.filter(
			(row) => row.teamId === teamId && row.opponentTeamId === opponentTeamId,
		)
		.map((row) => {
			const homeTeamId = row.isHome ? row.teamId : row.opponentTeamId
			const awayTeamId = row.isHome ? row.opponentTeamId : row.teamId
			const homeScore = row.isHome ? row.pointsFor : row.pointsAgainst
			const awayScore = row.isHome ? row.pointsAgainst : row.pointsFor
			return {
				gameId: row.gameId,
				date: row.date,
				homeTeamId,
				awayTeamId,
				homeScore,
				awayScore,
				winnerTeamId:
					homeScore === awayScore
						? null
						: homeScore > awayScore
							? homeTeamId
							: awayTeamId,
			}
		})
}

// One side's record over a series, from meetings already written home-first.
function seriesRecord(
	meetings: StatContextMeeting[],
	teamId: string,
): StatContextSplitRecord | null {
	if (meetings.length === 0) return null

	let wins = 0
	let losses = 0
	let ties = 0
	for (const meeting of meetings) {
		if (meeting.winnerTeamId === null) ties++
		else if (meeting.winnerTeamId === teamId) wins++
		else losses++
	}
	return { games: meetings.length, wins, losses, ties, otLosses: null }
}

// The two sides, in the order the question lists its options - the order the
// pick form shows, so the columns line up with the buttons a viewer is choosing
// between. Falls back to the game's own two teams for a question whose options
// name neither: a game total's options are Over and Under, and a hand-made
// who-wins question can look the same way.
function sidesFor(
	question: StatContextQuestion,
	game: NonNullable<StatContextQuestion["game"]>,
): [SubjectRef, SubjectRef] | null {
	const inGame = (teamId: string | null) =>
		teamId === game.homeTeamId || teamId === game.awayTeamId

	const named = question.optionSubjects.filter((option) => inGame(option.teamId))
	const pair =
		named.length === 2 && named[0]?.teamId !== named[1]?.teamId
			? named
			: question.competitors.filter((competitor) => inGame(competitor.teamId))

	const [first, second] = pair
	if (!first?.teamId || !second?.teamId) return null
	if (first.teamId === second.teamId) return null
	return [first, second]
}

// Everything a game-level question's card needs, or null when there is nothing
// honest to show.
//
// Both sides or neither, the same rule a head-to-head follows: one team's form
// beside a blank column reads as a comparison when it isn't one. A league's
// opening week therefore gets no card at all, which is right - nobody has
// played, and there is nothing to say.
export async function buildMatchup(
	question: StatContextQuestion,
	focus: StatContextMatchup["focus"],
	lastN: number,
): Promise<StatContextMatchup | null> {
	const game = question.game
	if (!game || !question.seasonId) return null

	const refs = sidesFor(question, game)
	if (!refs) return null

	const teamIds = refs
		.map((ref) => ref.teamId)
		.filter((id): id is string => id !== null)
	const [rows, standings] = await Promise.all([
		completedGames({
			seasonId: question.seasonId,
			teamIds,
			asOf: question.locksAt,
			excludeGameId: game.id,
		}),
		standingsAsOf(teamIds, question.seasonId, question.locksAt),
	])

	// A who-wins question has no line, so its records carry no cleared count.
	const ouLine = focus === "scoring" ? question.ouLine : null

	// Every meeting, ahead of the sides, because each side's series record is
	// counted over all of them while the list under the columns shows only the
	// most recent few.
	const [first, second] = refs
	const allMeetings = meetingsBetween(
		rows,
		first.teamId as string,
		second.teamId as string,
	)

	const sides = refs.map((ref): StatContextMatchupSide => {
		const teamId = ref.teamId as string
		const isHome = teamId === game.homeTeamId
		const ownRows = rows.filter((row) => row.teamId === teamId)
		// Form runs through the playoffs: a team's last five, its streak and
		// its rest into a Game 3 are the games it has actually just played.
		const results = ownRows.map(toResult)
		// Season figures stay on the regular season, which is what team_records
		// holds and what the matchup header above this card renders. Folding
		// October in would print a 101-61 under a header saying 98-59.
		const seasonResults = ownRows
			.filter((row) => !row.postseason)
			.map(toResult)
		const standing = standings.get(teamId)
		// ESPN's last-ten and streak are regular-season standings text, frozen
		// once the playoffs start. Past that point they describe a stretch that
		// is no longer this team's most recent.
		const standingIsCurrent = !ownRows.some((row) => row.postseason)

		// ESPN's own splits and streak where a reading predates the lock,
		// falling back to the same figures off this app's game rows otherwise.
		// The fallback is not a second-class answer - it is computed from the
		// games ESPN itself reported and is what every question that locked
		// before this app started taking readings has to use.
		const espnRoleCounts = standing
			? isHome
				? {
						wins: standing.homeWins,
						losses: standing.homeLosses,
						ties: standing.homeTies,
						otLosses: standing.homeOtLosses,
					}
				: {
						wins: standing.roadWins,
						losses: standing.roadLosses,
						ties: standing.roadTies,
						otLosses: standing.roadOtLosses,
					}
			: null
		const espnRole = espnRoleCounts
			? { games: recordGames(espnRoleCounts), ...espnRoleCounts }
			: null

		return {
			label: ref.label,
			teamId,
			isHome,
			// ESPN's own figure where a reading predates the lock, the same
			// total off this app's game rows otherwise.
			differential:
				(standing ? differentialFrom(question.leagueSlug, standing) : null) ??
				derivedDifferentialFrom(question.leagueSlug, seasonResults),
			overall: recordOf(seasonResults, ouLine),
			inThisRole:
				espnRole && espnRole.games > 0
					? espnRole
					: splitOf(
							seasonResults.filter((result) => result.isHome === isHome),
						),
			headToHead: seriesRecord(allMeetings, teamId),
			lastTen:
				(standingIsCurrent
					? parseRecordText(standing?.lastTen ?? null, question.leagueSlug)
					: null) ??
				(results.length >= LAST_TEN
					? splitOf(results.slice(0, LAST_TEN))
					: null),
			streak:
				(standingIsCurrent ? parseStreak(standing?.streak ?? null) : null) ??
				streakOf(results),
			recentResults: results.slice(0, lastN),
			restDays: restDaysBefore(game.startsAt, results),
		}
	}) as [StatContextMatchupSide, StatContextMatchupSide]

	if (sides.some((side) => side.overall === null)) return null

	return {
		focus,
		sides,
		meetings: allMeetings.slice(0, MEETING_LIMIT),
		includesPostseason: rows.some((row) => row.postseason),
	}
}

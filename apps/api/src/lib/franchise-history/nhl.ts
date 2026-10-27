import { nhlFranchiseTeam } from "./franchise-map"
import { fetchJson } from "./http"
import {
	HALL_OF_FAME_BONUS,
	type HistoryPlayer,
	type HistoryStint,
	type HistoryTeamSeason,
	type Log,
} from "./types"

// The NHL's all-time pools, from records.nhl.com: career totals per player
// per franchise, skaters and goalies separately, keyed by the NHL's own
// player id (the one its mugshot CDN uses). The same API flags Hall of
// Famers and the league's 100 Greatest Players. The exact seasons behind
// each stint come from the stats API's season-by-season summaries.

const RECORDS = "https://records.nhl.com/site/api"

export type NhlCareerRow = {
	playerId: number
	firstName: string
	lastName: string
	franchiseId: number
	teamAbbrevs: string
	// Season ids like 19791980.
	firstSeasonForGameType: number
	lastSeasonForGameType: number
	seasonsPlayed: number
	gamesPlayed: number
	activePlayer: boolean
	positionCode?: string
	// Skaters.
	points?: number
	// Goalies.
	wins?: number | null
}

// 19791980 -> 1980, the season-end year.
export const seasonEndYear = (seasonId: number) => seasonId % 10_000

// Half a point per game, a point per point (or two per goalie win, so a
// franchise goalie lands among its great skaters), and flat bonuses for
// the Hall of Fame and the 100 Greatest.
export function nhlScore(
	row: NhlCareerRow,
	flags: { hallOfFame: boolean; top100: boolean },
): number {
	return (
		row.gamesPlayed / 2 +
		(row.points ?? 0) +
		(row.wins ?? 0) * 2 +
		(flags.hallOfFame ? HALL_OF_FAME_BONUS.nhl : 0) +
		(flags.top100 ? 300 : 0)
	)
}

type Flags = { hallOfFame: Set<number>; top100: Set<number> }

type NhlPlayerStints = {
	row: NhlCareerRow
	active: boolean
	stints: HistoryStint[]
}

// A player with both a skater and a goalie row for one franchise (a handful
// from the 1920s) gets them added together.
export function nhlStints(
	rows: NhlCareerRow[],
	flags: Flags,
): Map<number, NhlPlayerStints> {
	const out = new Map<number, NhlPlayerStints>()
	for (const row of rows) {
		const team = nhlFranchiseTeam(row.franchiseId, row.teamAbbrevs)
		if (!team) continue
		const hallOfFame = flags.hallOfFame.has(row.playerId)
		const stint: HistoryStint = {
			teamAbbreviation: team,
			firstSeason: seasonEndYear(row.firstSeasonForGameType),
			lastSeason: seasonEndYear(row.lastSeasonForGameType),
			seasons: row.seasonsPlayed,
			games: row.gamesPlayed,
			score: nhlScore(row, {
				hallOfFame,
				top100: flags.top100.has(row.playerId),
			}),
			hallOfFame,
		}
		const entry = out.get(row.playerId) ?? { row, active: false, stints: [] }
		entry.active ||= row.activePlayer
		entry.stints.push(stint)
		out.set(row.playerId, entry)
	}
	return out
}

async function playerIds(cayenneExp: string): Promise<Set<number>> {
	const json = await fetchJson<{ data: { id: number }[] }>(
		`${RECORDS}/player?cayenneExp=${encodeURIComponent(cayenneExp)}&limit=-1`,
	)
	return new Set(json.data.map((player) => player.id))
}

const STATS = "https://api.nhle.com/stats/rest/en"

// One player's regular season in the NHL's stats API: every team he played
// for that season, by the team's code then ("QUE", "EDM,PHI" after a trade).
export type NhlSeasonRow = {
	playerId: number
	seasonId: number
	teamAbbrevs: string | null
}

export type NhlTeamRow = { triCode: string; franchiseId: number }

// Player id -> each franchise and season-end year he played, as
// player_team_seasons rows. Codes of franchises today's teams don't continue
// (the Maroons, the original Jets) drop out, as they do from the stints.
export function nhlTeamSeasons(
	rows: NhlSeasonRow[],
	teams: NhlTeamRow[],
): Map<number, HistoryTeamSeason[]> {
	const franchiseOf = new Map(
		teams.map((team) => [team.triCode, team.franchiseId]),
	)
	const out = new Map<number, HistoryTeamSeason[]>()
	for (const row of rows) {
		for (const code of (row.teamAbbrevs ?? "").split(",")) {
			const franchiseId = franchiseOf.get(code.trim())
			if (franchiseId === undefined) continue
			const team = nhlFranchiseTeam(franchiseId, code)
			if (!team) continue
			out.set(row.playerId, [
				...(out.get(row.playerId) ?? []),
				{ teamAbbreviation: team, season: seasonEndYear(row.seasonId) },
			])
		}
	}
	return out
}

async function loadNhlTeamSeasons(
	log: Log,
): Promise<Map<number, HistoryTeamSeason[]>> {
	const teams = await fetchJson<{ data: NhlTeamRow[] }>(`${STATS}/team`)
	const seasons = await fetchJson<{ data: { id: number }[] }>(`${STATS}/season`)
	log(`nhl: reading ${seasons.data.length} seasons of rosters`)
	const rows: NhlSeasonRow[] = []
	for (const { id } of seasons.data) {
		for (const kind of ["skater", "goalie"]) {
			const page = await fetchJson<{ data: NhlSeasonRow[] }>(
				`${STATS}/${kind}/summary?isAggregate=false&isGame=false&limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${id} and gameTypeId=2`)}`,
			)
			rows.push(...page.data)
		}
	}
	return nhlTeamSeasons(rows, teams.data)
}

export const nhlHeadshotUrl = (playerId: string) =>
	`https://assets.nhle.com/mugs/nhl/latest/${playerId}.png`

export async function loadNhlHistory(log: Log): Promise<HistoryPlayer[]> {
	const franchises = await fetchJson<{ data: { id: number }[] }>(
		`${RECORDS}/franchise`,
	)
	const rows: NhlCareerRow[] = []
	for (const { id } of franchises.data) {
		const skaters = await fetchJson<{ data: NhlCareerRow[] }>(
			`${RECORDS}/skater-career-scoring-regular-season?cayenneExp=${encodeURIComponent(`franchiseId=${id}`)}&limit=-1`,
		)
		const goalies = await fetchJson<{ data: NhlCareerRow[] }>(
			`${RECORDS}/goalie-career-stats?cayenneExp=${encodeURIComponent(`franchiseId=${id} and gameTypeId=2`)}&limit=-1`,
		)
		rows.push(
			...skaters.data,
			...goalies.data.map((row) => ({ ...row, positionCode: "G" })),
		)
		log(
			`nhl: franchise ${id} ${skaters.data.length} skaters, ${goalies.data.length} goalies`,
		)
	}
	const flags = {
		hallOfFame: await playerIds("inHockeyHof=1"),
		top100: await playerIds("inTop100Alltime=1"),
	}
	log(
		`nhl: ${flags.hallOfFame.size} Hall of Famers, ${flags.top100.size} of the 100 Greatest`,
	)
	const teamSeasons = await loadNhlTeamSeasons(log)

	return [...nhlStints(rows, flags)].map(
		([playerId, { row, active, stints }]) => ({
			sourceId: String(playerId),
			name: `${row.firstName} ${row.lastName}`,
			position: row.positionCode ?? null,
			espnId: null,
			imageId: String(playerId),
			headshotUrl: nhlHeadshotUrl(String(playerId)),
			active,
			stints,
			teamSeasons: teamSeasons.get(playerId) ?? [],
		}),
	)
}

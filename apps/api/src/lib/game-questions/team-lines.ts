import { db } from "../../db"
import type { SyncLeagueConfig } from "../../db/sync/leagues"
import {
	flattenCategorizedStatistics,
	parseStandingsEntries,
} from "../../db/sync/season-stats-parse"
import {
	blendSamples,
	needsPriorSeason,
	type OpponentAdjustment,
	opponentAdjustment,
	perGameSample,
	type SeasonSample,
} from "./lines"
import type { EspnAccess, Samples } from "./player-samples"

// Where a generated team over/under's line comes from. This season's scores
// are read straight off the games table rather than from ESPN: a team numeric
// guess is already graded against games.homeScore/awayScore (see
// lib/auto-resolve/decide.ts), so the same column that settles the question is
// the one its line is set from. Last season, which stands in while this one is
// short, comes from ESPN's team season statistics instead, because the games
// table only ever holds the current season and the next one (see syncYears in
// db/sync/sync-seasons.ts).

// One league season's final scores per team, keyed by team id.
export type TeamScores = Map<string, number[]>

// A league season as a team line reads it: what each team scored, what each
// team gave up, and what a game was worth league-wide. Every game puts one
// number in each team's scored list and the same number in the other's
// allowed list, so the league mean is both at once - the average team-game,
// which is what "an average defense" is measured against.
export type SeasonTable = {
	scored: TeamScores
	allowed: TeamScores
	leagueMean: number | null
}

type FinalGame = {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
}

export function scoresByTeam(games: FinalGame[]): TeamScores {
	return seasonTable(games).scored
}

export function seasonTable(games: FinalGame[]): SeasonTable {
	const scored: TeamScores = new Map()
	const allowed: TeamScores = new Map()
	let total = 0
	let teamGames = 0
	const push = (into: TeamScores, teamId: string, value: number) => {
		const prior = into.get(teamId) ?? []
		prior.push(value)
		into.set(teamId, prior)
	}
	for (const game of games) {
		if (game.homeScore === null || game.awayScore === null) continue
		push(scored, game.homeTeamId, game.homeScore)
		push(scored, game.awayTeamId, game.awayScore)
		push(allowed, game.homeTeamId, game.awayScore)
		push(allowed, game.awayTeamId, game.homeScore)
		total += game.homeScore + game.awayScore
		teamGames += 2
	}
	return {
		scored,
		allowed,
		leagueMean: teamGames === 0 ? null : total / teamGames,
	}
}

export function sampleOf(scores: number[] | undefined): SeasonSample | null {
	if (!scores || scores.length === 0) return null
	const total = scores.reduce((sum, score) => sum + score, 0)
	return { mean: total / scores.length, games: scores.length }
}

export type SeasonTableFor = (year: number) => Promise<SeasonTable>

const EMPTY_TABLE: SeasonTable = {
	scored: new Map(),
	allowed: new Map(),
	leagueMean: null,
}

// One fetch per league season per run, however many games ask for it. A
// season nothing has finished yet caches as an empty table, same as no season.
export function createSeasonTableCache(leagueId: string): SeasonTableFor {
	const cache = new Map<number, Promise<SeasonTable>>()
	const load = async (year: number): Promise<SeasonTable> => {
		const season = await db.query.seasons.findFirst({
			where: { leagueId, year },
			columns: { id: true },
		})
		if (!season) return EMPTY_TABLE
		const finals = await db.query.games.findMany({
			where: { seasonId: season.id, status: "final" },
			columns: {
				homeTeamId: true,
				awayTeamId: true,
				homeScore: true,
				awayScore: true,
			},
		})
		return seasonTable(finals)
	}
	return async (year) => {
		const table = cache.get(year) ?? load(year)
		cache.set(year, table)
		return table
	}
}

export type TeamScoresFor = (
	teamId: string,
	year: number,
) => Promise<SeasonSample | null>

// A team's own scoring off a season table, which the opponent adjustment
// reads too - one load of the season's games serves both.
export function teamScoresFrom(tableFor: SeasonTableFor): TeamScoresFor {
	return async (teamId, year) =>
		sampleOf((await tableFor(year)).scored.get(teamId))
}

export function createTeamScoreCache(leagueId: string): TeamScoresFor {
	return teamScoresFrom(createSeasonTableCache(leagueId))
}

export type TeamSeasonStatsFor = (
	espnTeamId: string,
	year: number,
) => Promise<Map<string, number> | null>

// One fetch per team and season per run, however many games ask for it. A
// failed or missing read is null, the same as no season at all.
export function createTeamSeasonStatsCache(
	config: SyncLeagueConfig,
	{ espn, requester }: EspnAccess,
): TeamSeasonStatsFor {
	const cache = new Map<string, Map<string, number> | null>()
	return async (espnTeamId, year) => {
		const key = `${espnTeamId}:${year}`
		if (cache.has(key)) return cache.get(key) ?? null
		const statistics = await requester.request(
			`${config.leagueSlug} team ${espnTeamId} season ${year}`,
			() => espn.fetchTeamSeasonStatistics(config.espnPath, year, espnTeamId),
		)
		const flattened = statistics
			? flattenCategorizedStatistics(statistics)
			: null
		cache.set(key, flattened)
		return flattened
	}
}

// A team's per-game scoring this season and, while this one is short of
// priorWeight games, last season. Last season is only read below that cutoff,
// the same one a player line uses (see needsPriorSeason).
export async function teamSamples(
	teamScoresFor: TeamScoresFor,
	teamSeasonStatsFor: TeamSeasonStatsFor,
	espnTeamId: string | undefined,
	template: { priorWeight: number; priorStat: string },
	teamId: string,
	year: number,
): Promise<Samples> {
	const season = await teamScoresFor(teamId, year)
	if (!needsPriorSeason(season, template.priorWeight) || !espnTeamId) {
		return { season, prior: null }
	}
	const previous = await teamSeasonStatsFor(espnTeamId, year - 1)
	return {
		season,
		prior: previous ? perGameSample(previous, template.priorStat) : null,
	}
}

// One league season's scoring allowed per team, from ESPN's standings: the
// only place last season's defense is available at all, since the games table
// holds this season and the next one and nothing older. One request covers
// every team in the league, where the per-team statistics endpoint would cost
// one each.
export type StandingsTable = {
	allowedPerGame: Map<string, number>
	gamesPlayed: Map<string, number>
	leagueMean: number | null
}

const statOf = (
	entry: { stats: { name: string; value?: number }[] },
	name: string,
) => entry.stats.find((stat) => stat.name === name)?.value

export function standingsTable(
	entries: Map<string, { stats: { name: string; value?: number }[] }>,
): StandingsTable {
	const allowedPerGame = new Map<string, number>()
	const gamesPlayed = new Map<string, number>()
	let total = 0
	let teamGames = 0
	for (const [espnTeamId, entry] of entries) {
		// Only baseball's standings carry gamesPlayed; the others leave it out
		// and the record adds up to the same number - the same fallback
		// db/sync/sync-team-season-stats.ts makes.
		const played =
			statOf(entry, "gamesPlayed") ??
			(statOf(entry, "wins") ?? 0) +
				(statOf(entry, "losses") ?? 0) +
				(statOf(entry, "ties") ?? 0)
		const against = statOf(entry, "pointsAgainst")
		if (!played || against === undefined) continue
		allowedPerGame.set(espnTeamId, against / played)
		gamesPlayed.set(espnTeamId, played)
		total += against
		teamGames += played
	}
	return {
		allowedPerGame,
		gamesPlayed,
		leagueMean: teamGames === 0 ? null : total / teamGames,
	}
}

export type StandingsFor = (year: number) => Promise<StandingsTable | null>

// One request per league season per run. A failed read caches as null, which
// leaves a line on the subject's own average rather than on half a comparison.
export function createStandingsCache(
	config: SyncLeagueConfig,
	{ espn, requester }: EspnAccess,
): StandingsFor {
	const cache = new Map<number, Promise<StandingsTable | null>>()
	const load = async (year: number) => {
		const root = await requester.request(
			`${config.leagueSlug} standings ${year}`,
			() => espn.fetchStandings(config.espnPath, year),
		)
		return root ? standingsTable(parseStandingsEntries(root)) : null
	}
	return (year) => {
		const table = cache.get(year) ?? load(year)
		cache.set(year, table)
		return table
	}
}

// The opposing side's scoring allowed and the league's own figure, blended
// over the same games so the two are comparable. Blending them separately
// would compare this season's opponent against a league average that counted
// last season too, and the ratio between them is the whole adjustment.
function blendAgainstLeague(
	season: { team: SeasonSample | null; league: number | null },
	prior: { team: SeasonSample | null; league: number | null },
	priorWeight: number,
): { allowed: SeasonSample; leagueMean: number } | null {
	const allowed = blendSamples(season.team, prior.team, priorWeight)
	if (!allowed) return null
	const seasonGames = season.team?.games ?? 0
	const priorGames = allowed.games - seasonGames
	const parts: [number, number][] = []
	if (seasonGames > 0 && season.league !== null) {
		parts.push([season.league, seasonGames])
	}
	if (priorGames > 0 && prior.league !== null) {
		parts.push([prior.league, priorGames])
	}
	if (parts.length === 0) return null
	const games = parts.reduce((sum, [, count]) => sum + count, 0)
	const mean = parts.reduce((sum, [value, count]) => sum + value * count, 0)
	return { allowed, leagueMean: mean / games }
}

export type OpponentDeps = {
	seasonTableFor: SeasonTableFor
	standingsFor: StandingsFor
	espnTeamIdByTeamId: Map<string, string>
}

// How much the opposing side moves this line, or null when the template asks
// for no adjustment or there is nothing solid to compare against.
export async function opponentFor(
	deps: OpponentDeps,
	template: { priorWeight: number; oppWeight?: number },
	opponentTeamId: string,
	year: number,
): Promise<OpponentAdjustment | null> {
	if (template.oppWeight === undefined) return null

	const table = await deps.seasonTableFor(year)
	const season = {
		team: sampleOf(table.allowed.get(opponentTeamId)),
		league: table.leagueMean,
	}

	let prior: { team: SeasonSample | null; league: number | null } = {
		team: null,
		league: null,
	}
	if (needsPriorSeason(season.team, template.priorWeight)) {
		const standings = await deps.standingsFor(year - 1)
		const espnTeamId = deps.espnTeamIdByTeamId.get(opponentTeamId)
		const mean = espnTeamId
			? standings?.allowedPerGame.get(espnTeamId)
			: undefined
		const games = espnTeamId
			? standings?.gamesPlayed.get(espnTeamId)
			: undefined
		prior = {
			team: mean !== undefined && games ? { mean, games } : null,
			league: standings?.leagueMean ?? null,
		}
	}

	const blended = blendAgainstLeague(season, prior, template.priorWeight)
	if (!blended) return null
	return opponentAdjustment(
		blended.allowed,
		blended.leagueMean,
		template.oppWeight,
	)
}

import { db } from "../../db"
import type { SyncLeagueConfig } from "../../db/sync/leagues"
import { flattenCategorizedStatistics } from "../../db/sync/season-stats-parse"
import { needsPriorSeason, perGameSample, type SeasonSample } from "./lines"
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

type FinalGame = {
	homeTeamId: string
	awayTeamId: string
	homeScore: number | null
	awayScore: number | null
}

export function scoresByTeam(games: FinalGame[]): TeamScores {
	const scores: TeamScores = new Map()
	for (const game of games) {
		if (game.homeScore === null || game.awayScore === null) continue
		for (const [teamId, score] of [
			[game.homeTeamId, game.homeScore],
			[game.awayTeamId, game.awayScore],
		] as const) {
			const prior = scores.get(teamId) ?? []
			prior.push(score)
			scores.set(teamId, prior)
		}
	}
	return scores
}

export function sampleOf(scores: number[] | undefined): SeasonSample | null {
	if (!scores || scores.length === 0) return null
	const total = scores.reduce((sum, score) => sum + score, 0)
	return { mean: total / scores.length, games: scores.length }
}

export type TeamScoresFor = (
	teamId: string,
	year: number,
) => Promise<SeasonSample | null>

// One fetch per league season per run, however many games ask for it. A
// season nothing has finished yet caches as an empty map, same as no season.
export function createTeamScoreCache(leagueId: string): TeamScoresFor {
	const cache = new Map<number, Promise<TeamScores>>()
	const load = async (year: number): Promise<TeamScores> => {
		const season = await db.query.seasons.findFirst({
			where: { leagueId, year },
			columns: { id: true },
		})
		if (!season) return new Map()
		const finals = await db.query.games.findMany({
			where: { seasonId: season.id, status: "final" },
			columns: {
				homeTeamId: true,
				awayTeamId: true,
				homeScore: true,
				awayScore: true,
			},
		})
		return scoresByTeam(finals)
	}
	return async (teamId, year) => {
		const scores = cache.get(year) ?? load(year)
		cache.set(year, scores)
		return sampleOf((await scores).get(teamId))
	}
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

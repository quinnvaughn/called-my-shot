import type { EspnClient } from "../../db/sync/espn-client"
import type { EspnRequester } from "../../db/sync/espn-requester"
import type { SyncLeagueConfig } from "../../db/sync/leagues"
import { flattenCategorizedStatistics } from "../../db/sync/season-stats-parse"
import { needsPriorSeason, perGameSample, type SeasonSample } from "./lines"
import type { StarterPick } from "./pick-subjects"

// Where a player's per-game average comes from, for a generated line and for
// pricing a line a person set (see line-pricing.ts): ESPN's season statistics,
// this season and, while it's short, last season.

export type Samples = { season: SeasonSample | null; prior: SeasonSample | null }

export type EspnAccess = { espn: EspnClient; requester: EspnRequester }

export type SeasonStatsFor = (
	espnAthleteId: string,
	year: number,
) => Promise<Map<string, number> | null>

// One fetch per athlete and season per run, however many templates or games
// ask for it. A failed or missing read is null, the same as no season at all.
export function createSeasonStatsCache(
	config: SyncLeagueConfig,
	{ espn, requester }: EspnAccess,
): SeasonStatsFor {
	const cache = new Map<string, Map<string, number> | null>()
	return async (espnAthleteId, year) => {
		const key = `${espnAthleteId}:${year}`
		if (cache.has(key)) return cache.get(key) ?? null
		const statistics = await requester.request(
			`${config.leagueSlug} athlete ${espnAthleteId} season ${year}`,
			() =>
				espn.fetchAthleteSeasonStatistics(config.espnPath, year, espnAthleteId),
		)
		const flattened = statistics
			? flattenCategorizedStatistics(statistics)
			: null
		cache.set(key, flattened)
		return flattened
	}
}

export async function playerSamples(
	seasonStatsFor: SeasonStatsFor,
	espnAthleteId: string | undefined,
	pick: Pick<StarterPick, "espnStat" | "espnGames" | "priorWeight">,
	year: number,
): Promise<Samples> {
	if (!espnAthleteId) return { season: null, prior: null }
	const current = await seasonStatsFor(espnAthleteId, year)
	const season = current
		? perGameSample(current, pick.espnStat, pick.espnGames)
		: null
	if (!needsPriorSeason(season, pick.priorWeight)) {
		return { season, prior: null }
	}
	const previous = await seasonStatsFor(espnAthleteId, year - 1)
	return {
		season,
		prior: previous
			? perGameSample(previous, pick.espnStat, pick.espnGames)
			: null,
	}
}

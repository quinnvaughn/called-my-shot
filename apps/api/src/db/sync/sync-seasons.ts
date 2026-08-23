import { db } from "../index"
import type { League } from "../schema"
import { seasons } from "../schema"
import { fetchSeason, fetchSeasonType } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"

// Which ESPN season years to pull each run. ESPN's year label means
// different things per league (see seasons.year's comment in
// schema/sports.ts), but "this calendar year and next" reliably covers
// whatever's actually current-or-upcoming right now regardless of which
// convention a given league's year label follows - getCurrentSeason
// (lib/seasons.ts) picks the right one out of whatever's synced.
function syncYears(): number[] {
	const year = new Date().getFullYear()
	return [year, year + 1]
}

async function syncSeasonYear(
	config: SyncLeagueConfig,
	league: League,
	year: number,
): Promise<void> {
	const season = await fetchSeason(config.espnPath, year)
	if (!season) return // ESPN hasn't published this year at all yet

	const [regular, post] = await Promise.all([
		fetchSeasonType(config.espnPath, year, 2),
		fetchSeasonType(config.espnPath, year, 3),
	])
	if (!regular) return // no regular season dates - nothing usable to store yet

	await db
		.insert(seasons)
		.values({
			leagueId: league.id,
			year: season.year,
			displayName: season.displayName,
			regularSeasonStartsAt: new Date(regular.startDate),
			regularSeasonEndsAt: new Date(regular.endDate),
			postseasonStartsAt: post ? new Date(post.startDate) : null,
			postseasonEndsAt: post ? new Date(post.endDate) : null,
		})
		.onConflictDoUpdate({
			target: [seasons.leagueId, seasons.year],
			set: {
				displayName: season.displayName,
				regularSeasonStartsAt: new Date(regular.startDate),
				regularSeasonEndsAt: new Date(regular.endDate),
				postseasonStartsAt: post ? new Date(post.startDate) : null,
				postseasonEndsAt: post ? new Date(post.endDate) : null,
			},
		})
}

export async function syncSeasons(
	config: SyncLeagueConfig,
	league: League,
): Promise<void> {
	for (const year of syncYears()) {
		await syncSeasonYear(config, league, year)
	}
}

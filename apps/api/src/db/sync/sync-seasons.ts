import { sql } from "drizzle-orm"
import { db } from "../index"
import type { League } from "../schema"
import { seasons, seasonWeeks } from "../schema"
import { fetchSeason, fetchSeasonType, fetchSeasonWeeks } from "./espn-client"
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

	const [row] = await db
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
		.returning({ id: seasons.id })

	if (config.windowType === "week") {
		await syncSeasonWeeks(config, row.id, year)
	}
}

// Week boundaries for a week-window league, straight from ESPN's calendar -
// what the Games tab's window stepper and the "N games this week" counts are
// measured against (see seasonWeeks in db/schema/sports.ts for why these
// can't be derived from the week's own games). Upsert-only: a week ESPN has
// moved gets its new dates, and nothing is deleted, since a week that
// vanishes from their calendar is far more likely a bad response than a real
// schedule change.
async function syncSeasonWeeks(
	config: SyncLeagueConfig,
	seasonId: string,
	year: number,
): Promise<void> {
	const [regular, post] = await Promise.all([
		fetchSeasonWeeks(config.espnPath, year, 2),
		fetchSeasonWeeks(config.espnPath, year, 3),
	])
	const rows = [
		...regular.map((week) => ({ week, seasonType: "regular" as const })),
		...post.map((week) => ({ week, seasonType: "postseason" as const })),
	].map(({ week, seasonType }) => ({
		seasonId,
		seasonType,
		weekNumber: week.number,
		startsAt: new Date(week.startDate),
		endsAt: new Date(week.endDate),
	}))
	if (rows.length === 0) return

	await db
		.insert(seasonWeeks)
		.values(rows)
		.onConflictDoUpdate({
			target: [
				seasonWeeks.seasonId,
				seasonWeeks.seasonType,
				seasonWeeks.weekNumber,
			],
			set: {
				startsAt: sql`excluded.starts_at`,
				endsAt: sql`excluded.ends_at`,
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

import { match } from "ts-pattern"
import type { games, seasons } from "../../db/schema"
import { HOUR_MS } from "../time"

// ESPN's season totals and standings trail the last game by about a day.
export const SEASON_SETTLE_DELAY_MS = 36 * HOUR_MS
// A game still marked scheduled this long after its start time was abandoned,
// a rainout never made up, rather than still to come, so it no longer holds
// the season open.
const ABANDONED_AFTER_MS = 72 * HOUR_MS

type SeasonDates = Pick<typeof seasons.$inferSelect, "regularSeasonEndsAt">

export function seasonSettlesAt(season: SeasonDates): Date {
	return new Date(season.regularSeasonEndsAt.getTime() + SEASON_SETTLE_DELAY_MS)
}

// Whether a regular season's numbers are final: the scheduled end has had time
// to settle, and none of its games is still being played or still to come.
// Takes the season's regular-season games that aren't final.
export function isSeasonResolutionDue(
	season: SeasonDates,
	unfinishedRegularGames: Pick<
		typeof games.$inferSelect,
		"status" | "startsAt"
	>[],
	now: Date,
): boolean {
	if (now < seasonSettlesAt(season)) return false
	return unfinishedRegularGames.every((game) =>
		match(game.status)
			.with("final", () => true)
			.with("live", () => false)
			.with(
				"scheduled",
				() => game.startsAt.getTime() < now.getTime() - ABANDONED_AFTER_MS,
			)
			.exhaustive(),
	)
}

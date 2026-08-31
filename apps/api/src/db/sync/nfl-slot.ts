import { DateTime } from "luxon"

// NFL's own broadcast-window vocabulary - not a shared cross-league concept
// (see games.slot in db/schema/sports.ts), so this map and the derivation
// below live entirely in this league's own sync module, not the schema.
// Recomputed from `startsAt` on every sync run rather than snapshotted once
// at ingest: this sync job already rewrites `startsAt` on every pass (see
// sync-games.ts), so a flex-scheduling change that moves a game's kickoff
// corrects the slot for free on the next run.
export const NFL_SLOT_LABELS: Record<string, string> = {
	THU: "THURSDAY NIGHT",
	SUN_EARLY: "SUNDAY EARLY",
	SUN_LATE: "SUNDAY LATE",
	SNF: "SUNDAY NIGHT",
	MNF: "MONDAY NIGHT",
}

// Order slot groups render in on the Games tab - not alphabetical, the order
// games are actually played across a week.
export const NFL_SLOT_ORDER = ["THU", "SUN_EARLY", "SUN_LATE", "SNF", "MNF"]

// Kickoff day/time in ET is what actually determines a broadcast window -
// verified live, ESPN's schedule/scoreboard responses carry no explicit slot
// field to read this off of directly.
export function deriveNflSlot(startsAt: Date): string {
	const et = DateTime.fromJSDate(startsAt, { zone: "America/New_York" })
	if (et.weekday === 4) return "THU" // Thursday
	if (et.weekday === 1) return "MNF" // Monday
	if (et.weekday === 7) {
		// Sunday
		if (et.hour < 16) return "SUN_EARLY"
		if (et.hour < 20) return "SUN_LATE"
		return "SNF"
	}
	// Any other kickoff day (a rare Saturday slate, an international game
	// moved off the usual grid) - fall back to the closest bucket by time
	// rather than inventing a sixth slot for a handful of games a season.
	return et.hour < 16 ? "SUN_EARLY" : et.hour < 20 ? "SUN_LATE" : "SNF"
}

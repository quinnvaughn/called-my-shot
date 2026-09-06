import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { match } from "ts-pattern"

// NFL's own broadcast-window vocabulary - not a shared cross-league concept
// (see games.slot in db/schema/games.ts), so this map and the derivation
// below live entirely in this league's own sync module, not the schema.
// Recomputed from `startsAt` on every sync run rather than snapshotted once
// at ingest: this sync job already rewrites `startsAt` on every pass (see
// sync-games.ts), so a flex-scheduling change that moves a game's kickoff
// corrects the slot for free on the next run.
//
// The Thursday/Sunday/Monday grid is the league's normal week, but it is not
// the whole schedule: the 2026 season opens on a Wednesday, weeks 15-17 add
// Saturday slates, and there's a Friday game most years. Those days get a
// plain day-name slot of their own rather than being forced into the nearest
// broadcast window, which is what put a Wednesday 8:20pm opener in the
// SUNDAY NIGHT group. Day name only, no "NIGHT" - an off-grid day carries
// afternoon and evening kickoffs alike (a Saturday slate runs from 1pm).
export const NFL_SLOT_LABELS: Record<string, string> = {
	TUE: "TUESDAY",
	WED: "WEDNESDAY",
	THU: "THURSDAY NIGHT",
	FRI: "FRIDAY",
	SAT: "SATURDAY",
	SUN_EARLY: "SUNDAY EARLY",
	SUN_LATE: "SUNDAY LATE",
	SNF: "SUNDAY NIGHT",
	MNF: "MONDAY NIGHT",
}

// Luxon weekday (1 = Monday ... 7 = Sunday) for the days with no broadcast
// window of their own - see NFL_SLOT_LABELS above.
const OFF_GRID_SLOTS: Record<number, string> = {
	2: "TUE",
	3: "WED",
	5: "FRI",
	6: "SAT",
}

// Kickoff day/time in ET is what actually determines a broadcast window -
// verified live, ESPN's schedule/scoreboard responses carry no explicit slot
// field to read this off of directly.
export function deriveNflSlot(startsAt: Date): string {
	const et = DateTime.fromJSDate(startsAt, { zone: SPORTS_TIME_ZONE })
	return match(et.weekday)
		.with(4, () => "THU")
		.with(1, () => "MNF")
		.with(7, () =>
			et.hour < 16 ? "SUN_EARLY" : et.hour < 20 ? "SUN_LATE" : "SNF",
		)
		.otherwise((weekday) => OFF_GRID_SLOTS[weekday])
}

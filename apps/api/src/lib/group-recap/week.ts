import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"

// A recap week runs Tuesday 00:00 to the next Tuesday 00:00 in the sports
// time zone. Tuesday rather than Monday so an NFL week's Monday night game
// lands in the week it belongs to; daily leagues don't care where the cut is.
export type RecapWeek = { key: string; start: Date; end: Date }

const TUESDAY = 2

function weekFrom(start: DateTime): RecapWeek {
	return {
		key: start.toISODate() ?? "",
		start: start.toJSDate(),
		// Added in the zone, so a week spanning a DST change is still seven
		// calendar days rather than 168 hours.
		end: start.plus({ weeks: 1 }).toJSDate(),
	}
}

export function weekContaining(at: Date): RecapWeek {
	const day = DateTime.fromJSDate(at, { zone: SPORTS_TIME_ZONE }).startOf("day")
	return weekFrom(day.minus({ days: (day.weekday - TUESDAY + 7) % 7 }))
}

// The latest week that has fully ended by `now`.
export function lastCompletedWeek(now: Date): RecapWeek {
	const current = DateTime.fromJSDate(weekContaining(now).start, {
		zone: SPORTS_TIME_ZONE,
	})
	return weekFrom(current.minus({ weeks: 1 }))
}

// "Oct 6 to 12", "Sep 29 to Oct 5". The end is the week's last day, the
// Monday, not the Tuesday it ends at.
export function formatWeekLabel(week: { start: Date; end: Date }): string {
	const first = DateTime.fromJSDate(week.start, {
		zone: SPORTS_TIME_ZONE,
	}).setLocale("en-US")
	const last = DateTime.fromJSDate(week.end, { zone: SPORTS_TIME_ZONE })
		.setLocale("en-US")
		.minus({ days: 1 })
	const end = first.hasSame(last, "month")
		? last.toFormat("d")
		: last.toFormat("MMM d")
	return `${first.toFormat("MMM d")} to ${end}`
}

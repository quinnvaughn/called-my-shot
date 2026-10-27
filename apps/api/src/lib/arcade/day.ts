import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"

// The arcade games (Name That Season, Blind Rank) run one puzzle a day for
// everyone, turning over at midnight in the sports time zone, the same day
// boundary as the rest of the app. Days are ISO dates, "2026-10-20", the form
// each game's play_date stores.

export function arcadeDay(now: Date): string {
	return DateTime.fromJSDate(now, { zone: SPORTS_TIME_ZONE }).toISODate() ?? ""
}

// The day `offset` days after `day`, counted in the sports time zone so a
// DST change can't skip or repeat one.
export function addArcadeDays(day: string, offset: number): string {
	return (
		DateTime.fromISO(day, { zone: SPORTS_TIME_ZONE })
			.plus({ days: offset })
			.toISODate() ?? ""
	)
}

// When the puzzle after `now`'s goes live.
export function nextArcadeDayAt(now: Date): Date {
	return DateTime.fromJSDate(now, { zone: SPORTS_TIME_ZONE })
		.startOf("day")
		.plus({ days: 1 })
		.toJSDate()
}

export function isArcadeDay(value: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		DateTime.fromISO(value, { zone: SPORTS_TIME_ZONE }).isValid
	)
}

// When `day` begins in the sports time zone, for games scored by when they
// were finished rather than by a puzzle's play_date.
export function arcadeDayStart(day: string): Date {
	return DateTime.fromISO(day, { zone: SPORTS_TIME_ZONE })
		.startOf("day")
		.toJSDate()
}

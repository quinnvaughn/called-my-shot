import { DateTime } from "luxon"

export function dayLabel(day: string): string {
	return DateTime.fromISO(day).toFormat("ccc LLL d")
}

// "Aug 9 – Oct 3", with the year on whichever end needs it: both ends of a
// span crossing New Year, and the end of any span outside the current year.
export function rangeLabel(
	startDay: string,
	endDay: string,
	today: string,
): string {
	const start = DateTime.fromISO(startDay)
	const end = DateTime.fromISO(endDay)
	const endFormat =
		end.year === DateTime.fromISO(today).year ? "LLL d" : "LLL d, yyyy"
	const startFormat = start.year === end.year ? "LLL d" : "LLL d, yyyy"
	return `${start.toFormat(startFormat)} – ${end.toFormat(endFormat)}`
}

export function spanWeeks(startDay: string, endDay: string): number {
	const days =
		Math.floor(
			DateTime.fromISO(endDay).diff(DateTime.fromISO(startDay), "days").days,
		) + 1
	return Math.ceil(days / 7)
}

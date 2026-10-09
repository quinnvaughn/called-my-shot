import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"

// Both the zone and the locale are pinned, and under SSR both matter.
//
// Zone: DateTime.fromISO with no zone lands in whatever zone the runtime is
// in - UTC on Fly, the reader's own zone in the browser. A call made at
// 2026-01-01T02:00:00Z renders "Jan 1, 2026" from the server and
// "Dec 31, 2025" after hydration in ET, so React swaps the text out from
// under the reader on the one string the call page exists to state.
// SPORTS_TIME_ZONE is already what every user-facing date in this app means.
//
// Locale: toFormat("MMM") resolves month names through the runtime's default
// locale, which is the same hydration mismatch by a different route - "Mar"
// on the server, "mars" in a French browser.
//
// Mirrored by formatCallDate in apps/api's share-cards/call-summary.ts, which
// prints the same date onto the og:image. No shared module across that
// boundary, same reasoning SHAPE_LABEL and formatGuess already carry.
export function formatCallDate(iso: string): string {
	return DateTime.fromISO(iso, { zone: SPORTS_TIME_ZONE })
		.setLocale("en-US")
		.toFormat("MMM d, yyyy")
}

// A day on the sports calendar, without the year - "Oct 20". Pinned the same
// way as formatCallDate above.
export function formatShortDate(iso: string): string {
	return DateTime.fromISO(iso, { zone: SPORTS_TIME_ZONE })
		.setLocale("en-US")
		.toFormat("MMM d")
}

// The moment a call went on the record, down to the minute, in the given
// zone - "Mar 3, 2026, 10:42 AM PDT". The zone name rides along because a
// clock time alone doesn't say whose clock it is. Render it through
// CallTimestamp rather than directly: that's what picks the reader's zone.
export function formatCallTimestamp(iso: string, zone: string): string {
	return DateTime.fromISO(iso, { zone })
		.setLocale("en-US")
		.toFormat("MMM d, yyyy, h:mm a ZZZZ")
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// How long ago a call was made, for a list of calls - "just now", "5m ago",
// "3h ago", "2d ago". Past a week the count stops meaning much ("23d ago"
// makes the reader do arithmetic), so it gives the date instead, with the
// year only once it's not this one. Render it through CallAge, which picks
// the zone and the clock.
export function formatCallAge(
	iso: string,
	nowMs: number,
	zone: string,
): string {
	const at = DateTime.fromISO(iso, { zone }).setLocale("en-US")
	const elapsed = nowMs - at.toMillis()
	if (elapsed < 60_000) return "just now"
	if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
	if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
	if (elapsed < WEEK_MS) return `${Math.floor(elapsed / 86_400_000)}d ago`
	const thisYear = DateTime.fromMillis(nowMs, { zone }).year
	return at.toFormat(at.year === thisYear ? "MMM d" : "MMM d, yyyy")
}

// The gap between calling something and being right about it - "11 months
// before it resolved". Months rather than days, because a 340-day gap
// reported as "340 days" is precision nobody asked for, and under a month
// there is no story to tell, so it returns null and the page says nothing.
export function formatCallLead(
	createdAtIso: string,
	resolvedAtIso: string,
): string | null {
	const created = DateTime.fromISO(createdAtIso, { zone: SPORTS_TIME_ZONE })
	const resolved = DateTime.fromISO(resolvedAtIso, { zone: SPORTS_TIME_ZONE })
	if (!created.isValid || !resolved.isValid) return null

	const months = Math.floor(resolved.diff(created, "months").months)
	if (months < 1) return null
	if (months < 12) {
		return `Called ${months} month${months === 1 ? "" : "s"} before it resolved`
	}
	const years = Math.floor(months / 12)
	return `Called ${years} year${years === 1 ? "" : "s"} before it resolved`
}

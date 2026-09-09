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

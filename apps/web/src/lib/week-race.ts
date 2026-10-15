import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import { DateTime } from "luxon"
import { pluralize } from "./pluralize"

type RaceMember = {
	rank: number | null
	totalPoints: number
	settledCallCount: number
}

// The line under the viewer's row in the week race: how far they are from
// the member next to them, and what they still need to qualify. Null when
// there's nothing to say.
export function viewerStandingLine(
	viewer: RaceMember,
	neighbor: (RaceMember & { name: string }) | null,
	qualifyingCalls: number,
): string | null {
	const parts: string[] = []

	if (viewer.rank !== null && neighbor) {
		const gap = Math.abs(viewer.totalPoints - neighbor.totalPoints)
		const name = neighbor.name
		if (gap === 0) parts.push(`Tied with ${name}`)
		else if (viewer.rank === 1) {
			parts.push(`${gap} ${pluralize(gap, "point")} ahead of ${name}`)
		} else parts.push(`${gap} ${pluralize(gap, "point")} behind ${name}`)
	}

	const needed = qualifyingCalls - viewer.settledCallCount
	if (needed > 0) {
		parts.push(`${needed} ${pluralize(needed, "call")} to qualify`)
	}

	return parts.length > 0 ? parts.join(" · ") : null
}

// A race row's trailing note: the calls still riding on the week, or for a
// member who can't win it yet, how far they are toward qualifying.
export function raceRowNote(
	member: RaceMember & { openCallCount: number },
	qualifyingCalls: number,
): string {
	if (member.settledCallCount < qualifyingCalls) {
		return `${member.settledCallCount} of ${qualifyingCalls} calls`
	}
	return `${member.openCallCount} open`
}

// When the week closes, read on the sports calendar: the last day of the week
// is the one before endsAt's midnight.
export function raceEndsLabel(
	endsAt: string,
	now: DateTime = DateTime.now(),
): string {
	const lastDay = DateTime.fromISO(endsAt, { zone: SPORTS_TIME_ZONE })
		.minus({ milliseconds: 1 })
		.startOf("day")
	const today = now.setZone(SPORTS_TIME_ZONE).startOf("day")
	const days = Math.round(lastDay.diff(today, "days").days)
	if (days <= 0) return "Ends tonight"
	if (days === 1) return "Ends tomorrow"
	return `Ends ${lastDay.setLocale("en-US").toFormat("cccc")}`
}

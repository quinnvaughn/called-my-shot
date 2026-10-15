import { DateTime } from "luxon"
import type { QuestionStatus } from "#/graphql/generated/graphql"
import { useNow } from "#/hooks/use-now"

// Only OPEN questions need a live countdown - every other status renders
// static text, so this is the only place that pays for the ticking interval.
// Shared by QuestionCard (its own lock line) and CallCard (the same text
// sits next to the caller's identity while their question is still open).
export function LockLine({
	status,
	locksAt,
}: {
	status: QuestionStatus
	locksAt: string
}) {
	const now = useNow(status === "OPEN" ? 60_000 : null)
	return <>{formatLockLine(locksAt, now)}</>
}

// `label` leads the countdown while the lock is still ahead: "Locks in 3
// hours", or "Next lock in 3 hours" where several locks share one line.
export function formatLockLine(
	locksAt: string,
	now: number,
	label = "Locks",
): string {
	const locksAtTime = DateTime.fromISO(locksAt)
	const current = DateTime.fromMillis(now)
	if (locksAtTime <= current) {
		// status doesn't flip off "open" the instant locksAt passes - the API's
		// lock job only runs every 15 minutes - so a question can still read
		// "open" a while after its game has started. A lock that just
		// happened still reads as "any moment"; anything
		// older than one tick of the countdown should read as locked, not
		// perpetually imminent.
		return current.diff(locksAtTime, "minutes").minutes < 1
			? "Locking any moment"
			: "Locked"
	}
	return `${label} ${locksAtTime.toRelative({ base: current })}`
}

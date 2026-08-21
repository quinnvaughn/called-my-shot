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

function formatLockLine(locksAt: string, now: number): string {
	const locksAtTime = DateTime.fromISO(locksAt)
	const current = DateTime.fromMillis(now)
	if (locksAtTime <= current) return "Locking any moment"
	return `Locks ${locksAtTime.toRelative({ base: current })}`
}

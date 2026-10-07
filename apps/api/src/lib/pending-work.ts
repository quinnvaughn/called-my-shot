// Hints, per process, that a queue table has rows a drain should look at, so
// the scheduler can leave the database alone on the ticks where it doesn't.
// Only the process that enqueued knows: a row written by a CLI script or on
// another machine, or a failed row waiting out its retry, is picked up by the
// daily sweeps in scheduler.ts instead.
//
// Marked inside the enqueuing transaction, so a drain can occasionally take
// the hint before the rows commit and find nothing. Those rows wait for the
// next hint or sweep.
export type PendingWork = "analytics" | "digests" | "season-start"

// The earliest unconsumed mark of each kind.
const markedAt = new Map<PendingWork, Date>()

export function markPending(kind: PendingWork, now = new Date()): void {
	if (!markedAt.has(kind)) markedAt.set(kind, now)
}

// True, and clears the mark, once the earliest mark is at least `delayMs` old.
// The delay is for a drain that can't send a row until it has sat a while
// (see SETTLE_MINUTES in email-digest.tsx).
export function takePending(
	kind: PendingWork,
	now = new Date(),
	delayMs = 0,
): boolean {
	const since = markedAt.get(kind)
	if (!since || now.getTime() - since.getTime() < delayMs) return false
	markedAt.delete(kind)
	return true
}

export function clearPendingForTests(): void {
	markedAt.clear()
}

import { LOSS_QUIPS } from "./loss-quips"
import { WIN_QUIPS } from "./win-quips"

export { LOSS_QUIPS } from "./loss-quips"
export { WIN_QUIPS } from "./win-quips"

// A plain, fast string hash (djb2) - not cryptographic, doesn't need to be.
// Just needs to spread a call's id evenly across a short quip list so two
// different calls don't suspiciously always land on the same line.
function hashString(value: string): number {
	let hash = 5381
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 33) ^ value.charCodeAt(i)
	}
	return hash >>> 0
}

// Deterministic, not random: the same call always picks the same line, on
// every visit and on both the web preview and the api's exported PNG, purely
// from its own id - nothing needs to be persisted or passed between the two,
// and a caller reopening a share card they already viewed sees the same joke
// they saw before rather than a new one each time. isWin only ever changes
// which pool is drawn from, never how the index itself is derived - a call's
// result is final once resolved, so which pool applies can't change either.
export function quipForCall(callId: string, isWin: boolean): string {
	const pool = isWin ? WIN_QUIPS : LOSS_QUIPS
	return pool[hashString(callId) % pool.length] as string
}

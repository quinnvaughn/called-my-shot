import { LOSS_QUIPS } from "./loss-quips"
import { NARROW_MISS_QUIPS } from "./narrow-miss-quips"
import { RUNAWAY_WIN_QUIPS } from "./runaway-win-quips"
import { WIN_QUIPS } from "./win-quips"

export { LOSS_QUIPS } from "./loss-quips"
export { NARROW_MISS_QUIPS } from "./narrow-miss-quips"
export { RUNAWAY_WIN_QUIPS } from "./runaway-win-quips"
export { WIN_QUIPS } from "./win-quips"

// Which pool a call draws from. More than win/loss because a generic self-own
// reads wrong on a call that missed by a yard, and a generic brag undersells
// one that won by thirty - see the header comments on the two newer pools.
// A narrow WIN and a runaway LOSS deliberately have no pool of their own:
// "by a hair" and "not close" are already stated by the card's label, and a
// matching quip under it would say the same thing twice.
export type QuipTone = "win" | "loss" | "narrow_miss" | "runaway_win"

const POOLS: Record<QuipTone, readonly string[]> = {
	win: WIN_QUIPS,
	loss: LOSS_QUIPS,
	narrow_miss: NARROW_MISS_QUIPS,
	runaway_win: RUNAWAY_WIN_QUIPS,
}

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
// they saw before rather than a new one each time. `tone` only ever changes
// which pool is drawn from, never how the index itself is derived - and a
// tone is a function of the call's result and its margin, both of which are
// fixed the moment the question resolves, so neither can change under a
// reader either.
export function quipForCall(callId: string, tone: QuipTone): string {
	const pool = POOLS[tone]
	return pool[hashString(callId) % pool.length] as string
}

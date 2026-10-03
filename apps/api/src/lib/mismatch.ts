// How lopsided a head-to-head is, read off the one thing it compares: each
// side's per-game average in the stat being asked about.

// The trailing side's average as a share of the leading side's. Null when
// neither side has produced anything, which is no comparison at all.
export function shareOfLeader(a: number, b: number): number | null {
	const leader = Math.max(a, b)
	if (leader <= 0) return null
	return Math.min(a, b) / leader
}

// Under this share, a head-to-head carries the Mismatch tag: the leader is
// putting up half again as much or more of the very stat in question.
export const MISMATCH_RATIO = 2 / 3

// Under this share, the generator doesn't post the head-to-head at all. A gap
// this wide is answered before the game starts, which is a question in name
// only. Anything closer still goes up, tagged if it's under MISMATCH_RATIO.
export const GENERATED_DUEL_MIN_RATIO = 0.4

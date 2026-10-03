// Two players in a head-to-head have to be doing the same job for the
// comparison to mean anything. A counting stat piles up with time on the
// field, so an opener throwing 40 pitches against a starter throwing 90 is
// settled by the bullpen plan before either of them throws a pitch.
//
// The lighter side has to carry at least this share of the heavier side's
// workload. Openers and bulk relievers sit far under it; a starter on a soft
// pitch limit next to a workhorse sits around it.
export const WORKLOAD_MATCH_RATIO = 0.7

export function isWorkloadMismatch(a: number, b: number): boolean {
	const heavier = Math.max(a, b)
	if (heavier <= 0) return false
	return Math.min(a, b) / heavier < WORKLOAD_MATCH_RATIO
}

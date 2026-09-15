import { breakEvenLossRate } from "@called-my-shot/scoring"

export type HitCount = { hits: number; total: number }

export function countHits(results: boolean[]): HitCount {
	return {
		hits: results.filter(Boolean).length,
		total: results.length,
	}
}

export function addHits(a: HitCount, b: HitCount): HitCount {
	return { hits: a.hits + b.hits, total: a.total + b.total }
}

// Every group's results together.
export function sumHits(groups: Iterable<boolean[]>): HitCount {
	let total: HitCount = { hits: 0, total: 0 }
	for (const results of groups) total = addHits(total, countHits(results))
	return total
}

// One group's hit rate (a league, a league stat) leaning on every other
// group's until it has results of its own: the others count as `weight`
// results at their own rate, so a brand-new league starts at the pooled rate
// and drifts to its own as its record builds. The same idea as last season
// standing in for games this season hasn't had (see blendSamples in
// ./lines). `pool` includes the group itself, which is taken back out so its
// results aren't counted twice. Null with no results anywhere.
export function pooledHitRate(
	own: HitCount,
	pool: HitCount,
	weight: number,
): number | null {
	const others = { hits: pool.hits - own.hits, total: pool.total - own.total }
	if (others.total <= 0) {
		return own.total > 0 ? own.hits / own.total : null
	}
	const othersRate = others.hits / others.total
	return (own.hits + weight * othersRate) / (own.total + weight)
}

const roundRate = (value: number) => Math.round(value * 100) / 100

// The loss rate a pick that hits `hitRate` of the time breaks even at (see
// breakEvenLossRate), kept within [min, max].
export function boundedLossRate(
	hitRate: number | null,
	min: number,
	max: number,
): number | null {
	if (hitRate === null) return null
	return roundRate(Math.min(max, Math.max(min, breakEvenLossRate(hitRate))))
}

// `current` moved toward `target` by at most `maxStep`, or null to leave it:
// no target, or already there.
export function stepRate(
	current: number,
	target: number | null,
	maxStep: number,
): number | null {
	if (target === null) return null
	const rate = roundRate(
		Math.min(current + maxStep, Math.max(current - maxStep, target)),
	)
	return rate === current ? null : rate
}

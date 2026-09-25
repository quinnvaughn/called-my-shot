import { targetLossRate } from "@called-my-shot/scoring"

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

// The loss rate a pick that hits `hitRate` of the time is priced at (see
// targetLossRate), kept within [min, max].
export function boundedLossRate(
	hitRate: number | null,
	min: number,
	max: number,
): number | null {
	if (hitRate === null) return null
	return roundRate(Math.min(max, Math.max(min, targetLossRate(hitRate))))
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

// A group's own hit rate, with nothing pooled in.
export function ownHitRate(results: boolean[]): number | null {
	if (results.length === 0) return null
	return results.filter(Boolean).length / results.length
}

// Adds `value` to `key`'s list in `lists` unless the list already holds
// `window` values. Fed most recent first, each list keeps only the latest.
export function pushWithin<T>(
	lists: Map<string, T[]>,
	key: string,
	value: T,
	window: number,
): void {
	const list = lists.get(key) ?? []
	if (list.length < window) list.push(value)
	lists.set(key, list)
}

// How a pooled loss rate is tuned for one family of questions (game stat
// leaders, titles).
export type LossRateTuning = {
	// The fewest resolved questions, across every group, before any rate
	// moves.
	minSample: number
	// The most recent resolved questions each group's record is read over.
	window: number
	// How many results every other group counts as while one group's own
	// record is small - see pooledHitRate.
	poolWeight: number
	// The most a rate moves in one run.
	maxStep: number
	minRate: number
	maxRate: number
}

export type LossRateTuner = ReturnType<typeof lossRateTuner>

// The pooled loss rate math for one family of questions, set by its tuning.
export function lossRateTuner(tuning: LossRateTuning) {
	const suggested = (hitRate: number | null) =>
		boundedLossRate(hitRate, tuning.minRate, tuning.maxRate)
	return {
		tuning,
		// A group's record leaning on `pool` (every group's results, its own
		// included) until its own is large.
		blended: (results: boolean[], pool: HitCount) =>
			pooledHitRate(countHits(results), pool, tuning.poolWeight),
		// Where a pick that hits `hitRate` of the time is priced, in bounds.
		suggested,
		// The rate to move to from `current`, or null to leave it: too few
		// resolved questions anywhere to go on, or already where the record
		// points.
		next: (current: number, hitRate: number | null, poolTotal: number) =>
			poolTotal < tuning.minSample
				? null
				: stepRate(current, suggested(hitRate), tuning.maxStep),
	}
}

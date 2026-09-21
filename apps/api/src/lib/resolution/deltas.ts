import type { LeagueStatDelta } from "../user-season-stats"

// What a call (numeric guess) or selection (every other shape) carried going
// into a resolution pass. resultPoints is null until it has been scored once;
// correct is only read when it has been.
export type PriorResult = { resultPoints: number | null; correct: boolean }

// What the pass leaves it at. Null means it ends up unscored.
export type NextResult = { points: number; correct: boolean } | null

// How far one call or selection moves its caller's user_season_stats row
// going from `prior` to `next`. Always new minus old rather than the new
// totals: a re-resolve (overturnDispute) runs against rows still holding
// their earlier result, so applying the totals would double-count it. The
// two conviction sums are the resolved and correct counts weighted by the
// pick's conviction, which never changes after cast, so a re-resolve that
// doesn't flip correctness nets them to zero exactly like the counts.
// callCount never moves here - it changes at cast and voiding time.
export function deltaFor(
	prior: PriorResult,
	next: NextResult,
	conviction: number,
): LeagueStatDelta {
	const wasResolved = prior.resultPoints !== null ? 1 : 0
	const wasCorrect = wasResolved && prior.correct ? 1 : 0
	const isResolved = next ? 1 : 0
	const isCorrect = next?.correct ? 1 : 0
	return {
		points: (next?.points ?? 0) - (prior.resultPoints ?? 0),
		resolvedCallCount: isResolved - wasResolved,
		correctCount: isCorrect - wasCorrect,
		convictionSum: (isResolved - wasResolved) * conviction,
		convictionSumCorrect: (isCorrect - wasCorrect) * conviction,
		callCount: 0,
	}
}

// The delta that takes `delta` back out.
export function negated(delta: LeagueStatDelta): LeagueStatDelta {
	return {
		points: -delta.points,
		resolvedCallCount: -delta.resolvedCallCount,
		correctCount: -delta.correctCount,
		convictionSum: -delta.convictionSum,
		convictionSumCorrect: -delta.convictionSumCorrect,
		callCount: -delta.callCount,
	}
}

// Shared scoring math for calls. Every option-based type (multiple_choice,
// yes_no, over_under, multi_select) scores through tierFor/selectionPoints.
// numeric_guess scores separately (see numericGuessPoints) - it can't be
// scored incrementally like the others because a hit's payout depends on how
// close everyone else in the field landed, not just on hitting the band.

const BASE_POINTS = 200

// An option's share of the field, as of however many calls exist right now.
// Used both for the live "X% of the field agrees" preview and, once a
// question resolves, for scoring - same formula either way, so the number
// shown while a question is open and the number it's actually scored against
// at lock can never drift apart.
export function fieldPct(optionCallCount: number, totalCalls: number): number {
	if (totalCalls === 0) return 0
	return (optionCallCount / totalCalls) * 100
}

export type ContrarianTier = { mult: number; label: string }

// The less popular a pick ends up being, the more it pays off. fieldPct here
// is the option's FINAL share of the field, computed once at resolution and
// applied to every selection on that option - not a per-caller snapshot.
// Snapshotting at call time would reward whoever happened to call first with
// a bigger multiplier regardless of whether their pick actually turned out to
// be contrarian, since an early snapshot reflects a tiny, still-forming field
// rather than real consensus. There's also no gaming risk in waiting: nothing
// in this app lets a caller resubmit to chase a better number once it exists.
export function tierFor(fieldPct: number): ContrarianTier {
	if (fieldPct >= 20) return { mult: 1, label: "FAVORITE" }
	if (fieldPct >= 10) return { mult: 1.5, label: "CONTENDER" }
	if (fieldPct >= 5) return { mult: 2.5, label: "UNDERDOG" }
	if (fieldPct >= 2) return { mult: 4, label: "DARK HORSE" }
	return { mult: 6, label: "LONG SHOT" }
}

// conviction is 1-100, how much of the tier's payout is actually in play.
export function selectionPoints(
	optionFieldPct: number,
	conviction: number,
	isCorrect: boolean,
): number {
	const stake = conviction / 100
	if (!isCorrect) return -Math.round(BASE_POINTS * stake)
	return Math.round(BASE_POINTS * stake * tierFor(optionFieldPct).mult)
}

export function hitTolerance(
	guessValue: number,
	actualValue: number,
	tolerancePct: number,
): boolean {
	const band = Math.abs(actualValue * tolerancePct)
	return Math.abs(guessValue - actualValue) <= band
}

const NUMERIC_MIN_MULT = 1
const NUMERIC_MAX_MULT = 6

// The tolerance band is the real win/loss line, same as picking the correct
// option elsewhere - without a genuine downside for missing it, numeric_guess
// would be a strictly better bet than every other type (upside with none of
// the risk), and callers would only ever answer these. A miss loses the full
// stake, flat, same as a wrong option pick. A hit pays out on a curve from
// NUMERIC_MIN_MULT (least precise hit in the field) to NUMERIC_MAX_MULT
// (closest) - ranked only against other hits, so landing in the band always
// beats missing it, no matter how many people also landed in the band.
export function numericGuessPoints(
	guesses: { callId: string; guessValue: number; conviction: number }[],
	actualValue: number,
	tolerancePct: number,
): { callId: string; points: number; hit: boolean }[] {
	const withHit = guesses.map((guess) => ({
		...guess,
		hit: hitTolerance(guess.guessValue, actualValue, tolerancePct),
	}))

	const hits = withHit.filter((guess) => guess.hit)
	const ranked = [...hits].sort(
		(a, b) =>
			Math.abs(a.guessValue - actualValue) -
			Math.abs(b.guessValue - actualValue),
	)
	const n = ranked.length
	const pointsByCallId = new Map(
		ranked.map((guess, index) => {
			const percentile = n === 1 ? 1 : 1 - index / (n - 1) // 1 = closest, 0 = furthest
			const mult =
				NUMERIC_MIN_MULT + percentile * (NUMERIC_MAX_MULT - NUMERIC_MIN_MULT)
			const stake = guess.conviction / 100
			return [guess.callId, Math.round(BASE_POINTS * stake * mult)] as const
		}),
	)

	return withHit.map((guess) => ({
		callId: guess.callId,
		hit: guess.hit,
		points: guess.hit
			? (pointsByCallId.get(guess.callId) ?? 0)
			: -Math.round(BASE_POINTS * (guess.conviction / 100)),
	}))
}

// Shared scoring math for calls. Every option-based type (multiple_choice,
// yes_no, over_under, multi_select) scores through tierFor/selectionPoints.
// numeric_guess scores separately: hitTolerance() decides accuracy, and its
// points come from ranking every guess against the field once the actual
// value is known (see numericGuessPoints) - it can't be scored incrementally
// like the others because a guess's payout depends on how close everyone
// else in the field landed.

const BASE_POINTS = 200

export type ContrarianTier = { mult: number; label: string }

// The less popular a pick was at the moment it was made, the more it pays off.
// fieldPct is that option's share of the field, snapshotted at call time.
export function tierFor(fieldPct: number): ContrarianTier {
	if (fieldPct >= 20) return { mult: 1, label: "FAVORITE" }
	if (fieldPct >= 10) return { mult: 1.5, label: "CONTENDER" }
	if (fieldPct >= 5) return { mult: 2.5, label: "UNDERDOG" }
	if (fieldPct >= 2) return { mult: 4, label: "DARK HORSE" }
	return { mult: 6, label: "LONG SHOT" }
}

// conviction is 1-100, how much of the tier's payout is actually in play.
export function selectionPoints(
	fieldPctAtCall: number,
	conviction: number,
	isCorrect: boolean,
): number {
	const stake = conviction / 100
	if (!isCorrect) return -Math.round(BASE_POINTS * stake)
	return Math.round(BASE_POINTS * stake * tierFor(fieldPctAtCall).mult)
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

// Ranks every guess on a resolved numeric_guess question by distance from the
// actual value and pays out on a curve from NUMERIC_MIN_MULT (furthest in the
// field) to NUMERIC_MAX_MULT (closest) - independent of whether a guess fell
// inside the tolerance band, which only decides the separate accuracy stat.
export function numericGuessPoints(
	guesses: { callId: string; guessValue: number; conviction: number }[],
	actualValue: number,
): { callId: string; points: number }[] {
	const n = guesses.length
	const ranked = [...guesses].sort(
		(a, b) =>
			Math.abs(a.guessValue - actualValue) -
			Math.abs(b.guessValue - actualValue),
	)

	return ranked.map((guess, index) => {
		const percentile = n === 1 ? 1 : 1 - index / (n - 1) // 1 = closest, 0 = furthest
		const mult =
			NUMERIC_MIN_MULT + percentile * (NUMERIC_MAX_MULT - NUMERIC_MIN_MULT)
		const stake = guess.conviction / 100
		return {
			callId: guess.callId,
			points: Math.round(BASE_POINTS * stake * mult),
		}
	})
}

// Live "if right / if wrong" preview shown while picking (before a call even
// exists) and again once it's locked in. The actual scoring formulas
// (BASE_POINTS_BY_TYPE, tierFor, earlyTierFor) live in the shared
// @called-my-shot/scoring package, imported here rather than duplicated, so
// this can never quietly drift from what the API actually scores at
// resolution - the server remains the source of truth for the real payout.
import {
	type ContrarianTier,
	type EarlyTier,
	earlyTierFor,
	NUMERIC_MAX_MULT,
	NUMERIC_MIN_MULT,
	tierFor,
} from "@called-my-shot/scoring"

export type { ContrarianTier, EarlyTier }
export { earlyTierFor, tierFor }

export type PointsPreview = {
	win: number
	lose: number
	tier: ContrarianTier
	earlyTier: EarlyTier
}

// Preview for the option-based types (multiple_choice/yes_no/over_under/
// multi_select) - both outcomes computed at once since which one applies
// isn't known until resolution. earlyRank/earlyTotalCalls are optional
// because this also runs before a call exists (no rank yet) - omitting them
// just leaves the early multiplier at 1x rather than guessing. basePoints
// comes from BASE_POINTS_BY_TYPE for this question's type.
export function previewSelectionPoints(
	basePoints: number,
	fieldPct: number,
	conviction: number,
	earlyRank?: number,
	earlyTotalCalls?: number,
): PointsPreview {
	const stake = conviction / 100
	const tier = tierFor(fieldPct)
	const earlyTier =
		earlyRank !== undefined && earlyTotalCalls !== undefined
			? earlyTierFor(earlyRank, earlyTotalCalls)
			: { mult: 1, label: "STANDARD" }
	return {
		win: Math.round(basePoints * stake * tier.mult * earlyTier.mult),
		lose: Math.round(basePoints * stake),
		tier,
		earlyTier,
	}
}

export type NumericPointsPreview = {
	winLow: number
	winHigh: number
	lose: number
	earlyTier: EarlyTier
}

// numeric_guess pays out on a curve ranked against everyone else who also
// hit the tolerance band (see numericGuessPoints in @called-my-shot/scoring)
// - unlike an option pick, the multiplier genuinely can't be known before
// resolution, so this reports the full possible range instead of one number.
// A miss is always a flat loss of the stake, same as every other type.
// earlyRank/earlyTotalCalls follow the same optional-before-a-call-exists
// rule as previewSelectionPoints above.
export function previewNumericPoints(
	basePoints: number,
	conviction: number,
	earlyRank?: number,
	earlyTotalCalls?: number,
): NumericPointsPreview {
	const stake = conviction / 100
	const earlyTier =
		earlyRank !== undefined && earlyTotalCalls !== undefined
			? earlyTierFor(earlyRank, earlyTotalCalls)
			: { mult: 1, label: "STANDARD" }
	return {
		winLow: Math.round(basePoints * stake * NUMERIC_MIN_MULT * earlyTier.mult),
		winHigh: Math.round(basePoints * stake * NUMERIC_MAX_MULT * earlyTier.mult),
		lose: Math.round(basePoints * stake),
		earlyTier,
	}
}

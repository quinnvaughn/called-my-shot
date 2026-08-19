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
	TIER_MAX_MULT,
	TIER_MIN_MULT,
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
	totalOptions: number,
	conviction: number,
	earlyRank?: number,
	earlyTotalCalls?: number,
): PointsPreview {
	const stake = conviction / 100
	const tier = tierFor(fieldPct, totalOptions)
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

// numeric_guess pays out on the same "how rare was being right" curve as
// every other type (see numericGuessPoints in @called-my-shot/scoring) -
// rare here means few people, out of the whole field, landed at least as
// close to the actual value as this guess did. Unlike an option pick, that
// share genuinely can't be known before resolution (it depends on where
// everyone else's guesses end up relative to a value nobody's seen yet), so
// this reports the full possible range instead of one number. A miss is
// always a flat loss of the stake, same as every other type. earlyRank/
// earlyTotalCalls follow the same optional-before-a-call-exists rule as
// previewSelectionPoints above.
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
		winLow: Math.round(basePoints * stake * TIER_MIN_MULT * earlyTier.mult),
		winHigh: Math.round(basePoints * stake * TIER_MAX_MULT * earlyTier.mult),
		lose: Math.round(basePoints * stake),
		earlyTier,
	}
}

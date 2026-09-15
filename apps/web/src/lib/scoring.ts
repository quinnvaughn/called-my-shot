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
	isSeasonLongShape,
	seasonEarlyTierFor,
	TIER_MAX_MULT,
	TIER_MIN_MULT,
	type ToleranceSpec,
	tierFor,
} from "@called-my-shot/scoring"

export type { ContrarianTier, EarlyTier, ToleranceSpec }
export { earlyTierFor, isSeasonLongShape, seasonEarlyTierFor, tierFor }

export type PointsPreview = {
	win: number
	lose: number
	tier: ContrarianTier
	earlyTier: EarlyTier
}

// The option/question call counts a not-yet-submitted call reads are always
// "before this call" - it doesn't exist yet. Feeding that raw fieldPct
// straight into a preview means the number the caller sees right before
// submitting isn't the number they'll see right after: their own selection
// is missing from both the option's count and the total, and adding it can
// swing fieldPct hard when the field is still small (going from 3 to 4
// total callers, adding yourself moves the ratio by 25%+, versus a rounding
// error once the field is large). Simulating "as if I already submitted"
// here means the preview always matches what fieldPct actually reads the
// instant after Lock It In, not a stale before-me snapshot.
export function previewFieldPct(
	optionCallCount: number,
	totalCalls: number,
): number {
	return ((optionCallCount + 1) / (totalCalls + 1)) * 100
}

// Preview for every option-based shape - both outcomes computed at once
// since which one applies isn't known until resolution. earlyTier is
// optional and caller-computed (via earlyTierFor for game-scoped shapes or
// seasonEarlyTierFor for season-long ones - see isSeasonLongShape) rather
// than raw rank/totalCalls, since which formula applies depends on the
// question's shape, which this function has no way to know. Omitting it
// just leaves the early multiplier at 1x rather than guessing - this also
// runs before a call exists (no rank, and no meaningful "as of my own
// createdAt" games-played reading either), where 1x is the correct read
// either way. basePoints comes from BASE_POINTS_BY_SHAPE and lossRate from
// LOSS_RATE_BY_SHAPE for this question's shape.
export function previewSelectionPoints(
	basePoints: number,
	lossRate: number,
	fieldPct: number,
	totalOptions: number,
	conviction: number,
	earlyTier: EarlyTier = { mult: 1, label: "STANDARD" },
): PointsPreview {
	const stake = conviction / 100
	const tier = tierFor(fieldPct, totalOptions)
	return {
		win: Math.round(basePoints * stake * tier.mult * earlyTier.mult),
		lose: Math.round(basePoints * stake * lossRate),
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

// A numeric-guess shape pays out on the same "how rare was being right"
// curve as every other shape (see numericGuessPoints in
// @called-my-shot/scoring) -
// rare here means few people, out of the whole field, landed at least as
// close to the actual value as this guess did. Unlike an option pick, that
// share genuinely can't be known before resolution (it depends on where
// everyone else's guesses end up relative to a value nobody's seen yet), so
// this reports the full possible range instead of one number. A miss is a
// flat loss of the stake at the shape's loss rate, same as every other type.
// earlyRank/earlyTotalCalls follow the same optional-before-a-call-exists
// rule as previewSelectionPoints above.
export function previewNumericPoints(
	basePoints: number,
	lossRate: number,
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
		lose: Math.round(basePoints * stake * lossRate),
		earlyTier,
	}
}

// Both multipliers come off continuous power curves (tierFor/earlyTierFor),
// so an unrounded one renders as "1.517819252974054" in a math ledger. One
// decimal is all a "why these points" line needs, and it matches the
// precision the backed-out early multiplier on ViewerStatusCard already
// showed. Display only - the full-precision value is what the point math
// runs on, here and on the server.
export function formatMult(mult: number): string {
	return String(Math.round(mult * 10) / 10)
}

// Exactly one of numericTolerancePct/numericToleranceAbsolute is ever
// non-null for a given question - see ToleranceSpec in
// @called-my-shot/scoring.
export function toleranceSpecFrom(
	pct: number | null,
	absolute: number | null,
): ToleranceSpec | null {
	if (absolute !== null) return { mode: "absolute", amount: absolute }
	if (pct !== null) return { mode: "percentage", pct }
	return null
}

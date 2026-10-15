import { pluralize } from "#/lib/pluralize"

// "1 caller" / "412 callers" - shared everywhere a raw callCount needs to
// read as a sentence (QuestionCard's footer, the sticky submit bar, the
// field breakdown card).
export function callersText(count: number): string {
	return `${count} ${pluralize(count, "caller")}`
}

// The same check against a bare tolerance tier, for callers holding a picked
// stat rather than a whole question (the create-question form, which has no
// question yet). Both halves matter: the win-total tiers are ABSOLUTE too (5
// wins for the NBA, 1 for the NFL), so mode alone would classify "Wins" as a
// rate stat - it is the non-integer band that actually marks one.
export function isRateToleranceTier(
	tier: { toleranceMode: string; toleranceValue: number } | null | undefined,
): boolean {
	return (
		tier?.toleranceMode === "ABSOLUTE" && !Number.isInteger(tier.toleranceValue)
	)
}

// True for a genuine rate stat (batting average, ERA) - see ToleranceSpec in
// @called-my-shot/scoring. Absolute-mode tolerance alone doesn't mean rate
// stat anymore: team_season_stat_numeric_guess (win totals) also snapshots
// an absolute-mode band, for a fixed-size tolerance, but a win total is
// still a whole number - the real "does this need a decimal point" signal is
// whether the tolerance amount itself is fractional (0.02 for batting
// average vs 5 for an NBA win total). numericToleranceAbsolute is checked
// first (set for every numeric_guess-family shape); an over/under shape has
// no tolerance snapshot on the question at all, so it falls back to the
// picked stat's own tolerance tier value instead - same signal, different
// source depending on shape. This one function is the single source of truth
// for that check - every call site below (and in call-summary.ts,
// resolution-summary.ts, question-result-block.tsx, resolve-question-modal.tsx,
// question-row-actions.tsx, use-cast-call-form.ts, $questionId.tsx) uses it
// rather than re-deriving the same logic, after exactly that duplication let
// win totals silently render as "5.000" instead of "5" in some of them and
// not others.
export function isRateStat(question: {
	numericToleranceAbsolute: number | null
	stat?: {
		toleranceTier?: { toleranceMode: string; toleranceValue: number } | null
	} | null
}): boolean {
	if (question.numericToleranceAbsolute != null) {
		return !Number.isInteger(question.numericToleranceAbsolute)
	}
	return isRateToleranceTier(question.stat?.toleranceTier)
}

// A rate stat (batting average, ERA) always displays padded to a fixed 3
// decimals - a trailing zero is meaningful there (".300" is a real, distinct
// value from ".3" read as "point three"), so trimming it the way a plain
// String()/toFixed would is actively wrong, not just imprecise. Every other
// stat keeps its natural precision instead (a counting-stat average like
// 27.4 never gets padded out to "27.400").
export function formatGuess(value: number, isRateStat = false): string {
	if (isRateStat) return value.toFixed(3)
	if (Number.isInteger(value)) return String(value)
	return String(Math.round(value * 1000) / 1000)
}

// Guards against floating-point drift from repeated decimal stepping (e.g.
// 0.27 + 0.01 landing on 0.28000000000000003) - rounds to the same 3 decimal
// places the guessValue column itself stores.
export function roundGuess(value: number): number {
	return Math.round(value * 1000) / 1000
}

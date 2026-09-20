import { type ToleranceSpec, toleranceBand } from "./index"

// How far a resolved call landed from the line it was called against, and
// whether that distance was remarkable in either direction. Purely
// descriptive: nothing here feeds points, and nothing in ./index.ts imports
// it. That separation is deliberate - see the paragraph above
// numericGuessPoints, which spells out why the tolerance band is a hard
// binary and why "almost right still counts a little" was rejected as a
// SCORING concept. This is the other half of that decision: the outcome
// stays binary, and the story of how close it was gets told on the card
// instead of in the ledger.
//
// Copy lives in the two app mirrors (apps/web's lib/call-summary.ts and
// apps/api's lib/share-cards/call-summary.ts), not here, for the same reason
// they already duplicate SHAPE_LABEL and formatGuess: the two sides work off
// different spellings of the shape enum, and only they know which label a
// given shape wants.

export type MarginVerdict = "narrow" | "runaway"

// The three ways a shape can produce two numbers worth subtracting. Every
// other shape (Yes/No, the three award shapes) has no number behind its
// answer at all and never builds a basis.
export type MarginBasis =
	// The over/under family. `spec` is the picked stat's own tolerance tier,
	// or null on a shape with no stat (game_total_over_under), which falls
	// back to FALLBACK_TOLERANCE_SPEC.
	| { kind: "line"; actual: number; line: number; spec: ToleranceSpec | null }
	// The numeric-guess family, where the tolerance band IS the grading line,
	// so the question's own snapshotted tolerance is always present.
	| { kind: "guess"; guess: number; actual: number; spec: ToleranceSpec }
	// Head-to-head, and a stat leader measured against the caller's own pick.
	| { kind: "gap"; winner: number; other: number }

export type CallMargin = {
	// The real distance, which the thresholds below are tested against.
	distance: number
	// The distance as it should be printed. Differs from `distance` only on
	// the line basis - see displayDistanceFor.
	displayDistance: number
	// Null when there are two numbers worth showing but the gap between them
	// isn't remarkable either way, which is the common case. The card still
	// states the distance; it just doesn't editorialize about it.
	verdict: MarginVerdict | null
}

// Every cutoff in one place. Each is a multiple of the stat's own calibrated
// tolerance band (see toleranceBand in ./index.ts) rather than a raw amount,
// because "close" means something different for 0.5 home runs than for 224.5
// passing yards, and the band is the codebase's existing answer to that.
//
// Checked against the real tiers in apps/api's db/catalog/stats.ts (Standard
// 15%, High-Volume 10%, rate stats absolute):
//
//   HR line 0.5          skipped, band degenerates (see isDegenerate)
//   Sacks line 2.5       skipped
//   Receptions line 4.5  skipped
//   NBA points 24.5      narrow <= 1,  runaway >= 7
//   NFL total 45.5       narrow <= 2,  runaway >= 13
//   Pass yards 224.5     narrow <= 7,  runaway >= 44   (High-Volume)
//   Batting avg .300     narrow <= .007, runaway >= .04
export const MARGIN_THRESHOLDS = {
	LINE_NARROW_SCALE: 0.35,
	LINE_RUNAWAY_SCALE: 2,
	// A hit this deep into its own band only just cleared it.
	GUESS_NARROW_HIT_SCALE: 0.75,
	// A miss inside this much of the band only just failed to clear it.
	GUESS_NARROW_MISS_SCALE: 1.5,
	GUESS_RUNAWAY_MISS_SCALE: 3,
	// Ratios rather than bands: a scoreline has no stat behind it, and two
	// actual results are already on the same measurement grid. Deliberately
	// conservative on the runaway side - a missed runaway is a non-event (the
	// card just says "Called it"), a runaway claimed on a one-score game is
	// embarrassing. NFL 24-21 -> 0.125 narrow, 27-24 -> 0.11 narrow,
	// 34-3 -> 0.91 runaway, 24-17 -> 0.29 neither.
	GAP_NARROW_RATIO: 0.15,
	GAP_RUNAWAY_RATIO: 0.45,
} as const

// What a shape with no stat of its own (game_total_over_under, and any
// question whose stat row is missing) is measured with. The catalog's
// Standard tier, so a combined-score line is judged the same way a team stat
// line is.
export const FALLBACK_TOLERANCE_SPEC: ToleranceSpec = {
	mode: "percentage",
	pct: 0.15,
}

function scaleSpec(spec: ToleranceSpec, factor: number): ToleranceSpec {
	return spec.mode === "absolute"
		? { mode: "absolute", amount: spec.amount * factor }
		: { mode: "percentage", pct: spec.pct * factor }
}

// True for a genuine rate stat (batting average, ERA). Mirrors isRateStat in
// apps/web's lib/field-signal.ts: absolute mode alone isn't the signal, since
// a season win total snapshots an absolute band too (5 for the NBA, 1 for the
// NFL) while still being a whole number. The fractional amount is what marks
// a scale with no integer grid.
function isRateSpec(spec: ToleranceSpec): boolean {
	return spec.mode === "absolute" && !Number.isInteger(spec.amount)
}

// Whether the stat is too coarse for a margin to mean anything. toleranceBand
// floors a percentage band at 1 so a low-count stat doesn't demand an exact
// guess, and that floor is right for grading - but it wrecks this. On a 0.5
// home run line the narrow cutoff floors to 1 and so does the runaway cutoff,
// which makes every possible outcome remarkable: actual 1 is "narrow", actual
// 2 is "runaway", and the label means nothing. Same for sacks, steals, blocks
// and receptions, whose lines sit at 2.5 or 4.5. Checking the UNFLOORED band
// catches exactly those stats and nothing else, with no allowlist to keep in
// sync. Absolute mode is exempt: a rate stat's band is already in the stat's
// own unit and was never floored.
function isDegenerate(value: number, spec: ToleranceSpec): boolean {
	if (spec.mode === "absolute") return false
	return Math.floor(Math.abs(value * spec.pct)) < 1
}

// A line always sits on a half (see setLine in apps/api's
// lib/game-questions/lines.ts: floor(mean * shade) + 0.5), so the raw
// distance from one is always .5, 1.5, 2.5 ... and printing it says you
// missed by half a yard, which is not an amount of yards that can happen.
// Rounding up gives the distance to the nearest result that would have
// flipped the call, which is the honest statement. A rate stat has no integer
// grid to round onto and keeps its raw distance.
//
// Only the line basis needs this. A guess and a gap both subtract two real
// measured values, so their difference is already achievable.
function displayDistanceFor(distance: number, spec: ToleranceSpec): number {
	return isRateSpec(spec) ? distance : Math.ceil(distance)
}

// `won` comes from the call's points sign (resultState in apps/web's
// lib/call-summary.ts), which is authoritative for every shape. It is passed
// in rather than re-derived because an admin re-resolve can edit
// numericActualValue or ouLine after the fact, and a label that contradicts
// the points is worse than no label at all.
//
// Returns null when there is nothing to state: a missing or degenerate pair
// of numbers, a result that landed exactly on the line, or geometry that
// disagrees with the recorded outcome. A non-null result with a null verdict
// is the normal case - the distance is worth printing, the size of it isn't
// worth a word.
export function callMargin(
	basis: MarginBasis,
	won: boolean,
): CallMargin | null {
	if (basis.kind === "line") return lineMargin(basis)
	if (basis.kind === "guess") return guessMargin(basis, won)
	return gapMargin(basis)
}

function lineMargin(
	basis: Extract<MarginBasis, { kind: "line" }>,
): CallMargin | null {
	const { actual, line } = basis
	if (line === 0) return null
	const distance = Math.abs(actual - line)
	// A result landing exactly on the line is a push. Auto-resolution voids
	// these (see gradeOverUnder), but a question resolved by hand can still
	// get here, and "off by 0" is not a margin.
	if (distance === 0) return null

	const spec = basis.spec ?? FALLBACK_TOLERANCE_SPEC
	const displayDistance = displayDistanceFor(distance, spec)

	// Note there is no won/geometry cross-check here, unlike the guess basis:
	// the distance from a line is the same number whichever side was picked,
	// so it has no direction that could contradict the points. `won` only
	// decides which of the two labels the app reaches for.
	const narrowSpec = scaleSpec(spec, MARGIN_THRESHOLDS.LINE_NARROW_SCALE)
	if (isDegenerate(Math.abs(line), narrowSpec)) {
		return { distance, displayDistance, verdict: null }
	}

	const narrowCutoff = toleranceBand(Math.abs(line), narrowSpec)
	const runawayCutoff = toleranceBand(
		Math.abs(line),
		scaleSpec(spec, MARGIN_THRESHOLDS.LINE_RUNAWAY_SCALE),
	)
	// Narrow is tested first: just above the degenerate floor the two cutoffs
	// can land on the same value, and a hair is the more interesting claim.
	const verdict =
		distance <= narrowCutoff
			? "narrow"
			: distance >= runawayCutoff
				? "runaway"
				: null
	return { distance, displayDistance, verdict }
}

function guessMargin(
	basis: Extract<MarginBasis, { kind: "guess" }>,
	won: boolean,
): CallMargin | null {
	const { guess, actual, spec } = basis
	const distance = Math.abs(guess - actual)
	const band = toleranceBand(actual, spec)

	// The one basis whose geometry can actually contradict the points, since
	// the band decides hit/miss outright. A disagreement means the stored
	// actual value moved after this call was scored.
	if (distance <= band !== won) return null

	const displayDistance = distance
	if (isDegenerate(actual, spec)) {
		return { distance, displayDistance, verdict: null }
	}

	if (won) {
		// No runaway on the win side: a guess that lands dead on already earns
		// its own "Nailed it" face, and a second superlative next to it is
		// noise.
		const verdict =
			distance >= band * MARGIN_THRESHOLDS.GUESS_NARROW_HIT_SCALE
				? "narrow"
				: null
		return { distance, displayDistance, verdict }
	}

	// Past the band by construction, so this is how far past.
	const verdict =
		distance <= band * MARGIN_THRESHOLDS.GUESS_NARROW_MISS_SCALE
			? "narrow"
			: distance >= band * MARGIN_THRESHOLDS.GUESS_RUNAWAY_MISS_SCALE
				? "runaway"
				: null
	return { distance, displayDistance, verdict }
}

function gapMargin(
	basis: Extract<MarginBasis, { kind: "gap" }>,
): CallMargin | null {
	const distance = Math.abs(basis.winner - basis.other)
	// Two identical numbers means there is nothing between the two sides to
	// describe. This is also what leaves a stat-leader WIN unflavored: the
	// caller's own pick is the winner, and scoredOptions trims leader shapes
	// to the correct option, so there is no runner-up to measure against. The
	// Actual row already names who led and what they put up, which is the
	// brag.
	if (distance === 0) return null
	const reference = Math.max(Math.abs(basis.winner), Math.abs(basis.other))
	if (reference === 0) return null

	const ratio = distance / reference
	const verdict =
		ratio <= MARGIN_THRESHOLDS.GAP_NARROW_RATIO
			? "narrow"
			: ratio >= MARGIN_THRESHOLDS.GAP_RUNAWAY_RATIO
				? "runaway"
				: null
	return { distance, displayDistance: distance, verdict }
}

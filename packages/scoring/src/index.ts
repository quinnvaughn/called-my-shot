// Shared scoring math - the ONE place these formulas live. Previously this
// was duplicated by hand in apps/api/src/lib/calls.ts (the real scoring, run
// at resolution) and apps/web/src/lib/scoring.ts (a live preview shown while
// picking and while a call is pending), kept in sync only by manually
// copying changes across both. That's exactly the kind of drift risk a
// shared workspace package exists to remove - both apps depend on this one
// instead of maintaining their own copy.

export type QuestionType =
	| "multiple_choice"
	| "yes_no"
	| "over_under"
	| "multi_select"
	| "numeric_guess"

// Difficulty varies by format, not by any individual pick - a binary yes/no
// needs less signal to call correctly than a continuous numeric guess, so
// the pool of points at stake scales with the format itself. This is
// independent of the contrarian tier and earliness bonus below, which are
// per-call and layer on top of whichever base a question's type starts from.
export const BASE_POINTS_BY_TYPE: Record<QuestionType, number> = {
	yes_no: 150,
	over_under: 150,
	multiple_choice: 200,
	multi_select: 250,
	// Was 300 - highest of every type, stacked on top of its own closeness
	// multiplier (see NUMERIC_MIN_MULT/NUMERIC_MAX_MULT below) that the other
	// types have no equivalent of at all: their tier multiplier is earned
	// conditionally (only if enough of the field disagreed with you), while
	// closeness pays out to nearly anyone who hits the tolerance band.
	// Trimmed toward multi_select rather than left the clear outlier.
	numeric_guess: 250,
}

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
	if (fieldPct >= 20) return { mult: 1, label: "SAFE" }
	if (fieldPct >= 10) return { mult: 1.5, label: "STEADY" }
	if (fieldPct >= 5) return { mult: 2.5, label: "BOLD" }
	if (fieldPct >= 2) return { mult: 4, label: "DARING" }
	return { mult: 6, label: "FEARLESS" }
}

export type EarlyTier = { mult: number; label: string }

// A second, independent multiplier from the contrarian tier above - being
// early and being contrarian aren't the same thing (you can call the eventual
// favorite on day one, or call a pick that stays a minority the whole way
// through without ever being early). rank/totalCalls is the call's position
// in the field's final call order, not clock time - a question that goes
// viral in an hour makes "day one" fully informed, while a slow-burn one
// keeps "day five" nearly as blind as day one, so raw time isn't the right
// proxy for how little crowd signal existed when you called.
//
// Deliberately a much smaller range than the contrarian tier (1x-2x vs
// 1x-6x): being early already tends to correlate with ending up contrarian
// (the crowd hasn't converged into a consensus yet), so stacking two full
// 1x-6x multipliers would reward the same underlying behavior twice and blow
// the ceiling out to 36x. Same as the contrarian tier, this only ever
// multiplies the win side (see selectionPoints/numericGuessPoints below) -
// it can't be farmed by calling early and often, since a wrong call still
// eats the full flat loss regardless of when it was made.
export function earlyTierFor(rank: number, totalCalls: number): EarlyTier {
	if (totalCalls === 0) return { mult: 1, label: "STANDARD" }
	const percentile = rank / totalCalls
	if (percentile <= 0.1) return { mult: 2, label: "FIRST MOVER" }
	if (percentile <= 0.25) return { mult: 1.5, label: "EARLY" }
	if (percentile <= 0.5) return { mult: 1.2, label: "AHEAD OF THE CURVE" }
	return { mult: 1, label: "STANDARD" }
}

// conviction is 1-100, how much of the tier's payout is actually in play.
// basePoints comes from BASE_POINTS_BY_TYPE for this question's type.
// earlyMult comes from earlyTierFor, computed by the caller from the call's
// (not the selection's) position in the field - a multi_select call has
// several selections made at the same instant, so earliness is a property of
// the call, not of any one pick within it.
export function selectionPoints(
	basePoints: number,
	optionFieldPct: number,
	conviction: number,
	isCorrect: boolean,
	earlyMult: number,
): number {
	const stake = conviction / 100
	if (!isCorrect) return -Math.round(basePoints * stake)
	return Math.round(
		basePoints * stake * tierFor(optionFieldPct).mult * earlyMult,
	)
}

// Floored, not rounded to nearest - nearest would sometimes make the actual
// band more forgiving than the percentage it came from (1.8 rounding up to
// 2 is a quietly better deal than the 15% that was promised). Floor can only
// match or undercut the raw percentage, never inflate it. Floored to a
// minimum of 1 rather than 0 - a low-count stat (blocks, steals) shouldn't
// require an exact guess just because the percentage math rounds a small
// number down to nothing.
//
// Exported (not module-local) and used for both sides of a guess - the real
// hit/miss check below (off the actual result) and the client's live preview
// while picking (off the guess itself, since the actual isn't known yet) -
// so the two can't silently drift into different formulas the way they once
// did.
export function toleranceBand(value: number, tolerancePct: number): number {
	return Math.max(1, Math.floor(Math.abs(value * tolerancePct)))
}

export function hitTolerance(
	guessValue: number,
	actualValue: number,
	tolerancePct: number,
): boolean {
	const band = toleranceBand(actualValue, tolerancePct)
	return Math.abs(guessValue - actualValue) <= band
}

// Exported (not module-local) so the client's live "if right" preview -
// apps/web/src/lib/scoring.ts - imports the real range instead of hand-
// copying a second literal that can silently drift from this one.
export const NUMERIC_MIN_MULT = 1
// Was 6, then 5 - still not the fix. Closeness isn't the same kind of
// multiplier as a selection's contrarian tier: tier only reaches 6x if the
// field genuinely disagreed with you, which is circumstantial and often
// doesn't happen, while closeness pays out to anyone who's simply accurate,
// which most people trying to guess correctly will be close to by default.
// Stacked on top of the highest base points of any type, that made
// numeric_guess pay out many times more than the other types for a
// comparably-good call. Capped at the same scale as the early-caller bonus
// (also 1-2x) instead - a modest bonus, not a second full multiplier axis.
export const NUMERIC_MAX_MULT = 2

// The tolerance band is the real win/loss line, same as picking the correct
// option elsewhere - without a genuine downside for missing it, numeric_guess
// would be a strictly better bet than every other type (upside with none of
// the risk), and callers would only ever answer these. A miss loses the full
// stake, flat, same as a wrong option pick. A hit pays out on a curve from
// NUMERIC_MIN_MULT (least precise hit in the field) to NUMERIC_MAX_MULT
// (closest) - ranked only against other hits, so landing in the band always
// beats missing it, no matter how many people also landed in the band.
// basePoints comes from BASE_POINTS_BY_TYPE.numeric_guess.
export function numericGuessPoints(
	basePoints: number,
	guesses: {
		callId: string
		guessValue: number
		conviction: number
		createdAt: Date
	}[],
	actualValue: number,
	tolerancePct: number,
): {
	callId: string
	points: number
	hit: boolean
	closenessMult: number | null
}[] {
	const withHit = guesses.map((guess) => ({
		...guess,
		hit: hitTolerance(guess.guessValue, actualValue, tolerancePct),
	}))

	// Same rank/totalCalls earliness as the option-based types - see
	// earlyTierFor above - just computed off createdAt directly since every
	// numeric_guess call is its own single guess (no separate selections).
	const totalCalls = guesses.length
	const orderedByTime = [...guesses].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	)
	const earlyMultByCallId = new Map(
		orderedByTime.map((guess, index) => [
			guess.callId,
			earlyTierFor(index + 1, totalCalls).mult,
		]),
	)

	const hits = withHit.filter((guess) => guess.hit)
	const ranked = [...hits].sort(
		(a, b) =>
			Math.abs(a.guessValue - actualValue) -
			Math.abs(b.guessValue - actualValue),
	)
	const n = ranked.length
	// closenessMult is returned per call (not just folded into the final
	// points) so it can be persisted at resolution - same reasoning as
	// selectionPoints not being the only thing stored for a selection: the
	// client needs the actual multiplier that was applied, not just the
	// number it produced, or it has no way to show real "why these points"
	// math after the fact.
	const closenessMultByCallId = new Map(
		ranked.map((guess, index) => {
			const percentile = n === 1 ? 1 : 1 - index / (n - 1) // 1 = closest, 0 = furthest
			const mult =
				NUMERIC_MIN_MULT + percentile * (NUMERIC_MAX_MULT - NUMERIC_MIN_MULT)
			return [guess.callId, mult] as const
		}),
	)
	const pointsByCallId = new Map(
		ranked.map((guess) => {
			const mult = closenessMultByCallId.get(guess.callId) ?? NUMERIC_MIN_MULT
			const stake = guess.conviction / 100
			const earlyMult = earlyMultByCallId.get(guess.callId) ?? 1
			return [
				guess.callId,
				Math.round(basePoints * stake * mult * earlyMult),
			] as const
		}),
	)

	return withHit.map((guess) => ({
		callId: guess.callId,
		hit: guess.hit,
		closenessMult: guess.hit
			? (closenessMultByCallId.get(guess.callId) ?? null)
			: null,
		points: guess.hit
			? (pointsByCallId.get(guess.callId) ?? 0)
			: -Math.round(basePoints * (guess.conviction / 100)),
	}))
}

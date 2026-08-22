// Shared scoring math - the ONE place these formulas live. Previously this
// was duplicated by hand across the API (the real scoring, run at
// resolution) and apps/web/src/lib/scoring.ts (a live preview shown while
// picking and while a call is pending), kept in sync only by manually
// copying changes across both. That's exactly the kind of drift risk a
// shared workspace package exists to remove - both apps depend on this one
// instead of maintaining their own copy.

export type QuestionShape =
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "player_season_stat_over_under"
	| "team_season_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "player_vs_player"
	| "player_vs_player_season"
	| "team_vs_team"
	| "yes_no_prop"
	| "player_season_award"
	| "team_season_award"
	| "player_award_finalists"

// Difficulty varies by format, not by any individual pick - a binary pick
// needs less signal to call correctly than a continuous numeric guess, so
// the pool of points at stake scales with the format itself. This is
// independent of the contrarian tier and earliness bonus below, which are
// per-call and layer on top of whichever base a question's shape starts
// from. Grouped by structural mechanism, not by subject - every shape that's
// functionally an exactly-2-option pick (yes_no_prop, player_vs_player,
// team_vs_team) shares one rate regardless of whether it has a player, team,
// or no subject at all.
export const BASE_POINTS_BY_SHAPE: Record<QuestionShape, number> = {
	yes_no_prop: 150,
	player_vs_player: 150,
	player_vs_player_season: 150,
	team_vs_team: 150,
	player_stat_over_under: 150,
	team_stat_over_under: 150,
	// Same rate as the game-scoped pair above - still a straight 2-option pick
	// mechanically, a season-long line doesn't change that.
	player_season_stat_over_under: 150,
	team_season_stat_over_under: 150,
	game_total_over_under: 150,
	player_award_finalists: 200,
	player_season_award: 250,
	team_season_award: 250,
	// Was 300 - highest of every shape. Trimmed toward the award shapes rather
	// than left the clear outlier (see numericGuessPoints below for how a
	// hit's multiplier is earned - same "how rare was being right" question
	// as every other shape now, not an easier one).
	player_stat_numeric_guess: 250,
	team_stat_numeric_guess: 250,
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

// The floor/ceiling of "how rare was being right" - shared by tierFor below
// AND numericGuessPoints further down, which reuses tierFor directly rather
// than maintaining its own separate range. Exported so nothing importing
// either has to hand-copy a literal 1/6 that could silently drift from this.
export const TIER_MIN_MULT = 1
export const TIER_MAX_MULT = 6

// Continuous version of what used to be a 5-band lookup table (SAFE/STEADY/
// BOLD/DARING/FEARLESS at flat field-% cutoffs of 20/10/5/2%). That table had
// two problems: hard cliffs at each boundary (19.9% vs 20.1% swung the payout
// 50% for a rounding error), and it was blind to how many options a question
// even had - on a wide open-field multiple_choice question, an "average",
// no-real-conviction option can sit under a flat 5% purely because the field
// is split thin across many options, while the same 5% on a yes_no question
// means the crowd is genuinely lopsided. Same old multiplier, very different
// amount of real boldness behind it.
//
// relativeRarity fixes both: it's this option's share of the field divided
// by the "expected" share if the field were spread evenly across every
// option (1/totalOptions) - so it's normalized against field size before the
// curve ever sees it. mult = clamp((0.4/relativeRarity)^0.6, 1, 6) was fit
// directly against the old table's binary-question anchor points (totalOptions
// = 2, since yes_no/over_under are always binary) and reproduces them closely:
// 20%->1.0, 10%->1.52 (was 1.5), 5%->2.30 (was 2.5), 2%->3.98 (was 4), 1%->6.0
// (was 6 under the old <2% floor). This isn't a rebalance, it's smoothing the
// same curve the discrete table was already tracing and generalizing it to
// account for option count. clamp handles both ends for free: relativeRarity
// >= 0.4 floors to 1, and relativeRarity -> 0 (nobody else picked it, or
// division by zero when literally no one did) ceilings to 6.
//
// fieldPct here is the option's FINAL share of the field, computed once at
// resolution and applied to every selection on that option - not a
// per-caller snapshot. Snapshotting at call time would reward whoever
// happened to call first with a bigger multiplier regardless of whether
// their pick actually turned out to be contrarian, since an early snapshot
// reflects a tiny, still-forming field rather than real consensus. There's
// also no gaming risk in waiting: nothing in this app lets a caller resubmit
// to chase a better number once it exists.
export function tierFor(fieldPct: number, totalOptions: number): ContrarianTier {
	const relativeRarity = (fieldPct / 100) * totalOptions
	const mult = Math.min(
		TIER_MAX_MULT,
		Math.max(TIER_MIN_MULT, (0.4 / relativeRarity) ** 0.6),
	)
	return { mult, label: tierLabel(mult) }
}

// Bucketed purely for display (badges like "FEARLESS") - never used in point
// math. Thresholds sit at the midpoints between the old table's fixed values
// (1, 1.5, 2.5, 4, 6), so a label still means roughly what it always did even
// though the underlying multiplier is now continuous.
function tierLabel(mult: number): string {
	if (mult < 1.25) return "SAFE"
	if (mult < 2) return "STEADY"
	if (mult < 3.25) return "BOLD"
	if (mult < 5) return "DARING"
	return "FEARLESS"
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
// Continuous version of what used to be a 4-band lookup table (STANDARD/
// AHEAD OF THE CURVE/EARLY/FIRST MOVER at flat percentile cutoffs of 50/25/
// 10%), for the same reason as tierFor above: flat cutoffs mean a cliff right
// at each boundary (10th vs 11th percentile swung the bonus 33%) for no real
// difference in how early the call was. mult = clamp(percentile^-0.301, 1, 2)
// was fit against the old table's anchor points and reproduces them closely:
// 10th->2.0, 25th->1.52 (was 1.5), 50th->1.23 (was 1.2), 100th->1.0.
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
	const mult = Math.min(2, Math.max(1, percentile ** -0.301))
	return { mult, label: earlyLabel(mult) }
}

// Bucketed purely for display, same reasoning as tierLabel above - thresholds
// sit at the midpoints between the old table's fixed values (1, 1.2, 1.5, 2).
function earlyLabel(mult: number): string {
	if (mult < 1.1) return "STANDARD"
	if (mult < 1.35) return "AHEAD OF THE CURVE"
	if (mult < 1.75) return "EARLY"
	return "FIRST MOVER"
}

// conviction is 1-100, how much of the tier's payout is actually in play.
// basePoints comes from BASE_POINTS_BY_SHAPE for this question's shape.
// earlyMult comes from earlyTierFor, computed by the caller from the call's
// (not the selection's) position in the field - a player_season_award/
// team_season_award call has several selections made at the same instant, so
// earliness is a property of the call, not of any one pick within it.
export function selectionPoints(
	basePoints: number,
	optionFieldPct: number,
	totalOptions: number,
	conviction: number,
	isCorrect: boolean,
	earlyMult: number,
): number {
	const stake = conviction / 100
	if (!isCorrect) return -Math.round(basePoints * stake)
	return Math.round(
		basePoints * stake * tierFor(optionFieldPct, totalOptions).mult * earlyMult,
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

// The tolerance band is the real win/loss line, same as picking the correct
// option elsewhere - without a genuine downside for missing it, the two
// numeric-guess shapes would be a strictly better bet than every other shape
// (upside with none of the risk), and callers would only ever answer these.
// A miss loses the full stake, flat, same as a wrong option pick. That line
// stays a hard binary on purpose - every other shape's win/loss is binary too
// (you picked the correct option or you didn't), and softening it into a
// decaying "almost right still counts a little" would make numeric-guess
// shapes the one place wrong is negotiable, undermining the same "being
// wrong has to actually show up" principle the rest of the scoring model
// leans on.
//
// A hit's multiplier reuses tierFor - "hit" vs "miss" is a binary outcome
// (totalOptions=2), the same shape as a yes_no pick - fed a share computed
// against the WHOLE field, not just other hitters: what fraction of every
// caller (hit or miss) landed at least as close to the actual value as this
// guess did. Only other hits can ever count toward that share (a miss is by
// definition farther away than the tolerance band, which is always >= any
// hit's distance), but sizing it against totalCalls rather than just the hit
// count is what makes it meaningful: being the closest of 3 hitters reads as
// rare when there were 40 total guessers, and NOT rare when there were only
// 4. It also naturally prices in how "obvious" a guess was - if a big chunk
// of the field converges on the same close answer (a low-count stat like
// steals, where half the field might correctly guess 1), everyone tied at
// that distance shares a large, unremarkable share and scores near the
// floor, same as a popular option pick landing in the SAFE tier. This
// replaced an earlier version that ranked purely by distance among hitters,
// which had exactly the two problems above: a thin hit count read as rare
// regardless of the total field size, and there was no way for an "everyone
// guessed the obvious number" hit to score any differently than a genuinely
// rare exact guess.
// basePoints comes from BASE_POINTS_BY_SHAPE for whichever numeric-guess
// shape this is.
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
	closenessFieldPct: number | null
}[] {
	const withHit = guesses.map((guess) => ({
		...guess,
		hit: hitTolerance(guess.guessValue, actualValue, tolerancePct),
		distance: Math.abs(guess.guessValue - actualValue),
	}))

	// Same rank/totalCalls earliness as the option-based shapes - see
	// earlyTierFor above - just computed off createdAt directly since every
	// numeric-guess call is its own single guess (no separate selections).
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

	// closenessMult and closenessFieldPct are both returned per call (not just
	// folded into the final points) so they can be persisted at resolution -
	// same reasoning as selectionPoints not being the only thing stored for a
	// selection: the client needs the actual multiplier AND the raw share it
	// came from, not just the number it produced, or it has no way to show
	// real "why these points" math (or "why this multiplier") after the fact.
	const hits = withHit.filter((guess) => guess.hit)
	const closenessByCallId = new Map(
		hits.map((guess) => {
			const atLeastAsClose = hits.filter(
				(other) => other.distance <= guess.distance,
			).length
			const sharePct = (atLeastAsClose / totalCalls) * 100
			return [
				guess.callId,
				{ mult: tierFor(sharePct, 2).mult, sharePct },
			] as const
		}),
	)
	const pointsByCallId = new Map(
		hits.map((guess) => {
			const mult = closenessByCallId.get(guess.callId)?.mult ?? TIER_MIN_MULT
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
			? (closenessByCallId.get(guess.callId)?.mult ?? null)
			: null,
		closenessFieldPct: guess.hit
			? (closenessByCallId.get(guess.callId)?.sharePct ?? null)
			: null,
		points: guess.hit
			? (pointsByCallId.get(guess.callId) ?? 0)
			: -Math.round(basePoints * (guess.conviction / 100)),
	}))
}

// Share-card flavor text (WIN_QUIPS/LOSS_QUIPS) and quipForCall, the
// deterministic picker between them, live in ./quips - split out from the
// scoring math above since that list is expected to keep growing and has
// nothing to do with points.
export { LOSS_QUIPS, quipForCall, WIN_QUIPS } from "./quips"

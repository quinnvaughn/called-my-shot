import { SEASON_PLAY_WEEK_MIN_CALLS } from "@called-my-shot/scoring"
import { match, P } from "ts-pattern"
import type { QuestionVoidedReason } from "#/graphql/generated/graphql"
import { resultState } from "#/lib/call-summary"
import { pluralize } from "#/lib/pluralize"
import type { QuestionPhase } from "#/lib/question-detail-state"
import type { RecordTone } from "#/lib/record-tag"
import { formatMult } from "#/lib/scoring"

// "unscored": the question resolved but this call was left out of scoring
// (see callUnscoredReason on the API), so it has no win or loss to show.
export type CallResult = ReturnType<typeof resultState> | { status: "unscored" }

// Where things stand between the viewer and one question. Every combination
// of the question's phase and whether the viewer called it lands in exactly
// one of these, so the detail page and ViewerStatusCard match on a single
// kind instead of re-combining phase booleans with `viewerCall` at each use.
export type ViewerStatus<Call> =
	// Open and never called: the call form owns the page.
	| { kind: "canCall" }
	| { kind: "lockedNoCall" }
	// Called and awaiting a result, whether or not the question has locked.
	| { kind: "pending"; call: Call; isLocked: boolean }
	| { kind: "resolvedNoCall"; disputed: boolean }
	// `result` can still be pending on a settled question until the call's
	// points have been written.
	| { kind: "resolved"; call: Call; disputed: boolean; result: CallResult }
	// Settled with no result: no call on the question scores, called or not.
	| { kind: "voided"; call: Call | null }

export function viewerStatus<
	Call extends { totalPoints: number | null; unscoredReason?: string | null },
>(phase: QuestionPhase, call: Call | null | undefined): ViewerStatus<Call> {
	if (call == null) {
		return match(phase)
			.returnType<ViewerStatus<Call>>()
			.with("open", () => ({ kind: "canCall" }))
			.with("locked", () => ({ kind: "lockedNoCall" }))
			.with("resolved", "disputed", (settled) => ({
				kind: "resolvedNoCall",
				disputed: settled === "disputed",
			}))
			.with("voided", () => ({ kind: "voided", call: null }))
			.exhaustive()
	}
	return match(phase)
		.returnType<ViewerStatus<Call>>()
		.with("open", "locked", (unsettled) => ({
			kind: "pending",
			call,
			isLocked: unsettled === "locked",
		}))
		.with("resolved", "disputed", (settled) => ({
			kind: "resolved",
			call,
			disputed: settled === "disputed",
			result: call.unscoredReason
				? { status: "unscored" }
				: resultState(call.totalPoints),
		}))
		.with("voided", () => ({ kind: "voided", call }))
		.exhaustive()
}

// The dispute footer under a settled outcome. A resolution can be disputed by
// anyone who saw it, not just people who called. Hidden while a dispute is
// already open (the "Disputed:" title communicates that) and for good once one
// has been upheld or overturned, since further correction is an admin action
// rather than another dispute.
export type DisputeAction = "hidden" | "underReview" | "available"

export function disputeAction(
	status: ViewerStatus<unknown>,
	dispute: { hasSettledDispute: boolean; hasViewerDispute: boolean },
): DisputeAction {
	return match(status)
		.returnType<DisputeAction>()
		.with(
			{ kind: P.union("canCall", "lockedNoCall", "pending", "voided") },
			() => "hidden",
		)
		.with({ kind: P.union("resolvedNoCall", "resolved") }, ({ disputed }) => {
			if (disputed || dispute.hasSettledDispute) return "hidden"
			return dispute.hasViewerDispute ? "underReview" : "available"
		})
		.exhaustive()
}

// What a voided question's card says in place of a result.
export function voidedText(reason: QuestionVoidedReason | null): string {
	return match(reason)
		.with(
			"SUBJECT_DID_NOT_PLAY",
			() => "The player this is about didn't play, so no call on it scores.",
		)
		.with(
			"GAME_NOT_COMPLETED",
			() => "The game wasn't completed, so no call on it scores.",
		)
		.with("TIE", () => "It ended in a tie, so no call on it scores.")
		.with(
			"NO_LEADER",
			() => "Nobody recorded this stat, so no call on it scores.",
		)
		.with(
			"LEADER_NOT_IN_POOL",
			() => "The leader wasn't one of the options, so no call on it scores.",
		)
		.with("OTHER", null, () => "No call on this question scores.")
		.exhaustive()
}

export type ShareOutcome = { isWin: boolean; points: number }

export type ResultFace = {
	tone: RecordTone
	label: string
	outcome: ShareOutcome | null
}

// A settled call's own result as the card presents it: the badge, plus the
// win and points it's shared with (null until the call's points are written).
// marginLabel replaces the verdict word when this call's margin was
// remarkable, exactly as it does in the eyebrow on /calls/:id. The two are the
// same claim about the same call, so one reading "Inches away" while the other
// says "Missed" would be a visible contradiction.
export function resultFace(
	result: CallResult,
	marginLabel: string | null,
): ResultFace {
	return match(result)
		.returnType<ResultFace>()
		.with({ status: "pending" }, () => ({
			tone: "neutral",
			label: "Pending",
			outcome: null,
		}))
		.with({ status: "win" }, ({ points }) => ({
			tone: "success",
			label: marginLabel ?? "Won",
			outcome: { isWin: true, points },
		}))
		.with({ status: "loss" }, ({ points }) => ({
			tone: "danger",
			label: marginLabel ?? "Missed",
			outcome: { isWin: false, points },
		}))
		.with({ status: "unscored" }, () => ({
			tone: "neutral",
			label: "Not scored",
			outcome: null,
		}))
		.exhaustive()
}

// A pick's row renders one of two ways depending on whether the question has
// resolved yet - "preview" (pending) shows the projected range if the pick
// turns out right, "resolved" shows what actually happened. Same row shape,
// same "why these points" ledger either way, which is the whole point: this
// is the one component both the pending card and the won/lost card render
// through, not two near-duplicate ones.
export type SelectionRowResult =
	| { kind: "preview" }
	// points is the real call_selections.result_points value, not
	// recomputed from live fieldPct/rank - see resultPoints in
	// ViewerStatusCardFragment for why that distinction matters.
	| { kind: "resolved"; isCorrect: boolean; points: number }
export type NumericRowResult =
	| { kind: "preview" }
	// closenessMult and closenessFieldPct are the real, persisted values (null
	// on a miss) - the early multiplier isn't stored separately, but it's
	// exact arithmetic to back out: totalPoints / (committed × closenessMult).
	| {
			kind: "resolved"
			totalPoints: number
			closenessMult: number | null
			closenessFieldPct: number | null
	  }

export function selectionRowResult(
	selection: {
		resultPoints: number | null
		option: { isCorrect: boolean | null }
	},
	settled: boolean,
): SelectionRowResult {
	const { isCorrect } = selection.option
	if (!settled || isCorrect === null || selection.resultPoints === null) {
		return { kind: "preview" }
	}
	return { kind: "resolved", isCorrect, points: selection.resultPoints }
}

export function numericRowResult(
	call: {
		totalPoints: number | null
		closenessMult: number | null
		closenessFieldPct: number | null
	},
	settled: boolean,
): NumericRowResult {
	if (!settled || call.totalPoints === null) return { kind: "preview" }
	return {
		kind: "resolved",
		totalPoints: call.totalPoints,
		closenessMult: call.closenessMult,
		closenessFieldPct: call.closenessFieldPct,
	}
}

// A season-long call's season-play weight, the weeks behind it and the league
// they're counted in (see SeasonPlay). Null on any other call.
export type SeasonPlayTerm = {
	weight: number
	weeksPlayed: number
	weeksCounted: number
	settled: boolean
	league: string
} | null

// The line a season-long pick carries under its points, so what play is doing
// to them shows without opening the breakdown.
export function seasonPlayLine(play: SeasonPlayTerm): string | null {
	if (!play) return null
	const { weight, weeksPlayed, weeksCounted, league } = play
	const share =
		weight >= 1 ? "in full" : `for ${Math.round(weight * 100)}% of its points`
	const weeks = `${weeksPlayed} of ${weeksCounted} ${league} ${pluralize(weeksCounted, "week")}`
	if (play.settled) return `Counted ${share}: you played ${weeks}.`
	if (weeksCounted === 0) {
		return `Counts in full so far. Make ${SEASON_PLAY_WEEK_MIN_CALLS} ${league} game calls a week to keep it there.`
	}
	return weight >= 1
		? `Counts in full at your ${league} pace: ${weeks} played. Make ${SEASON_PLAY_WEEK_MIN_CALLS} ${league} game calls a week to keep it there.`
		: `Counts ${share} at your ${league} pace: ${weeks} played. Playing more weeks grows it.`
}

// A priced underdog's own multiplier in a win's math, ahead of the bonuses.
// Nothing on any other side, which pays 1x before them.
export function underdogMath(winMult: number): string {
	return winMult > 1 ? `× ${formatMult(winMult)} underdog ` : ""
}

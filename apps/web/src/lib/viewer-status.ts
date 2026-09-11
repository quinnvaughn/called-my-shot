import { match, P } from "ts-pattern"
import { resultState } from "#/lib/call-summary"
import type { QuestionPhase } from "#/lib/question-detail-state"

export type CallResult = ReturnType<typeof resultState>

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

export function viewerStatus<Call extends { totalPoints: number | null }>(
	phase: QuestionPhase,
	call: Call | null | undefined,
): ViewerStatus<Call> {
	if (call == null) {
		return match(phase)
			.returnType<ViewerStatus<Call>>()
			.with("open", () => ({ kind: "canCall" }))
			.with("locked", () => ({ kind: "lockedNoCall" }))
			.with("resolved", "disputed", (settled) => ({
				kind: "resolvedNoCall",
				disputed: settled === "disputed",
			}))
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
			result: resultState(call.totalPoints),
		}))
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
		.with({ kind: P.union("canCall", "lockedNoCall", "pending") }, () => "hidden")
		.with({ kind: P.union("resolvedNoCall", "resolved") }, ({ disputed }) => {
			if (disputed || dispute.hasSettledDispute) return "hidden"
			return dispute.hasViewerDispute ? "underReview" : "available"
		})
		.exhaustive()
}

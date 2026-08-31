import { questionDetailState } from "./question-detail-state"

export type BallotMemberState =
	| "uncalled"
	| "pending"
	| "won"
	| "lost"
	| "missed"

// Shared by BallotStrip (the question-detail-page nav strip) and the public
// ballot detail page's member list - both need to bucket a member into the
// same five faces from the same underlying fields the rest of the app
// already uses for won/lost (see question-result-block.tsx/
// viewer-status-card.tsx), not a parallel state machine.
export function ballotMemberState(member: {
	question: {
		status: "OPEN" | "LOCKED" | "RESOLVED" | "DISPUTED"
		locksAt: string
		viewerCall: {
			hitTolerance: boolean | null
			selections: { option: { isCorrect: boolean | null } }[]
		} | null
	}
}): BallotMemberState {
	const { question } = member
	const state = questionDetailState(question)
	const call = question.viewerCall

	if (!state.isSettled) {
		if (call) return "pending"
		return state.isLocked ? "missed" : "uncalled"
	}
	if (!call) return "missed"

	const correct =
		call.hitTolerance ??
		call.selections.some((s) => s.option.isCorrect === true)
	return correct ? "won" : "lost"
}

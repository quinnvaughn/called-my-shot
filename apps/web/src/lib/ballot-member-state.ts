import { questionDetailState } from "./question-detail-state"

export type BallotMemberState =
	| "uncalled"
	| "pending"
	| "won"
	| "lost"
	| "missed"
	// Called, but the question was voided: it counts as called and is neither
	// a win nor a loss.
	| "voided"

type MemberCall = {
	hitTolerance: boolean | null
	selections: { option: { isCorrect: boolean | null } }[]
}

// Shared by BallotSetRail (the question-detail-page rail), the public
// ballot detail page's member list and a user's ballot entry page - all need
// to bucket a member into the same faces from the same underlying fields the
// rest of the app already uses for won/lost (see question-result-block.tsx/
// viewer-status-card.tsx), not a parallel state machine. The call comes in
// separately from the question because on an entry page it's the entry
// owner's call, not the viewer's.
export function ballotMemberState(
	question: {
		status: "OPEN" | "LOCKED" | "RESOLVED" | "DISPUTED" | "VOIDED"
		locksAt: string
	},
	call: MemberCall | null,
): BallotMemberState {
	const state = questionDetailState(question)

	if (state.isVoided) return call ? "voided" : "missed"
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

// A multi-pick question (player_season_award/team_season_award with more than
// one slot, e.g. "OF (3)") scores each selection independently - one pick
// can win while another loses on the very same call - so each gets its own
// dot rather than one shared dot standing in for the whole question.
export function selectionDotState(
	isCorrect: boolean | null,
	isSettled: boolean,
): BallotMemberState {
	if (!isSettled) return "pending"
	return isCorrect ? "won" : "lost"
}

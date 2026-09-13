import type { CallUnscoredReason, Question } from "../db/schema"
import type { LeagueStatDelta } from "./user-season-stats"

export type ContributingCall = {
	resultPoints: number | null
	hitTolerance: boolean | null
	unscoredReason: CallUnscoredReason | null
	selections: {
		resultPoints: number | null
		option: { isCorrect: boolean | null } | null
	}[]
}

// What one call currently adds to its caller's user_season_stats row: its
// callCount from castCall, plus whatever resolveQuestionInternal scored it.
// Read off the call's own persisted results rather than recomputed, so
// anything taking a call's effect back out (voiding, deleting) removes exactly
// what was put in. An unscored call contributes no result, and a call on a
// voided question doesn't count as a call either.
export function callContribution(
	call: ContributingCall,
	questionStatus: Question["status"],
): LeagueStatDelta {
	const contribution: LeagueStatDelta = {
		points: 0,
		resolvedCallCount: 0,
		correctCount: 0,
		callCount: questionStatus === "voided" ? 0 : 1,
	}
	if (call.unscoredReason !== null) return contribution

	if (call.selections.length > 0) {
		for (const s of call.selections) {
			if (s.resultPoints === null) continue
			contribution.points += s.resultPoints
			contribution.resolvedCallCount += 1
			if (s.option?.isCorrect) contribution.correctCount += 1
		}
	} else if (call.resultPoints !== null) {
		contribution.points += call.resultPoints
		contribution.resolvedCallCount += 1
		if (call.hitTolerance) contribution.correctCount += 1
	}
	return contribution
}

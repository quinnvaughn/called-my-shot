import type { CallUnscoredReason, Question } from "../db/schema"
import { negated } from "./resolution/deltas"
import { addLeagueStatDelta, type LeagueStatDelta } from "./user-season-stats"

export type ContributingCall = {
	resultPoints: number | null
	hitTolerance: boolean | null
	// numeric_guess only, and nullable on the column - every other shape
	// carries conviction per selection instead.
	conviction: number | null
	unscoredReason: CallUnscoredReason | null
	selections: {
		resultPoints: number | null
		conviction: number
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
		convictionSum: 0,
		convictionSumCorrect: 0,
		callCount: questionStatus === "voided" ? 0 : 1,
	}
	if (call.unscoredReason !== null) return contribution

	if (call.selections.length > 0) {
		for (const s of call.selections) {
			if (s.resultPoints === null) continue
			contribution.points += s.resultPoints
			contribution.resolvedCallCount += 1
			contribution.convictionSum += s.conviction
			if (s.option?.isCorrect) {
				contribution.correctCount += 1
				contribution.convictionSumCorrect += s.conviction
			}
		}
	} else if (call.resultPoints !== null) {
		contribution.points += call.resultPoints
		contribution.resolvedCallCount += 1
		// A scored numeric guess always has a conviction - resolveQuestion
		// filters conviction-less calls out of the field before scoring, so
		// they never get resultPoints in the first place. Guarded anyway rather
		// than coerced to 0, which would quietly drag the caller's average
		// conviction down if that ever stopped holding.
		if (call.conviction !== null) {
			contribution.convictionSum += call.conviction
			if (call.hitTolerance) {
				contribution.convictionSumCorrect += call.conviction
			}
		}
		if (call.hitTolerance) contribution.correctCount += 1
	}
	return contribution
}

// Per caller, what takes every one of a question's calls back out of
// user_season_stats - exactly what callContribution says each one put in.
export function reversalDeltas(
	calls: (ContributingCall & { userId: string })[],
	questionStatus: Question["status"],
): Map<string, LeagueStatDelta> {
	const deltas = new Map<string, LeagueStatDelta>()
	for (const call of calls) {
		addLeagueStatDelta(
			deltas,
			call.userId,
			negated(callContribution(call, questionStatus)),
		)
	}
	return deltas
}

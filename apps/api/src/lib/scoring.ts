type ScorableCall = {
	resultPoints: number | null
	hitTolerance: boolean | null
	selections: Array<{
		resultPoints: number | null
		option: { isCorrect: boolean | null } | null
	}>
}

export type ScoreSummary = {
	totalPoints: number
	resolvedCallCount: number
	correctCount: number
}

// Shared by every "sum a set of calls into points/accuracy" computation
// (site leaderboard, group leaderboard, profile stats) - numeric_guess scores
// off resultPoints/hitTolerance directly on the call, every other question
// type scores through its callSelections instead.
export function scoreCalls(calls: ScorableCall[]): ScoreSummary {
	let totalPoints = 0
	let resolvedCallCount = 0
	let correctCount = 0

	for (const call of calls) {
		if (call.selections.length > 0) {
			for (const selection of call.selections) {
				if (selection.resultPoints === null) continue
				resolvedCallCount++
				totalPoints += selection.resultPoints
				if (selection.option?.isCorrect) correctCount++
			}
		} else if (call.resultPoints !== null) {
			resolvedCallCount++
			totalPoints += call.resultPoints
			if (call.hitTolerance) correctCount++
		}
	}

	return { totalPoints, resolvedCallCount, correctCount }
}

export function accuracyFrom(summary: ScoreSummary): number | null {
	return summary.resolvedCallCount > 0
		? (summary.correctCount / summary.resolvedCallCount) * 100
		: null
}

type RankableEntry = {
	totalPoints: number
	accuracy: number | null
	resolvedCallCount: number
}

// Shared tiebreak for every points-sorted ranking (site leaderboard, group
// leaderboard): points first, then accuracy (a tied point total earned at a
// higher hit rate is the better prediction record - not just noisier
// volume), then fewer resolved calls (reaching the same points/accuracy in
// fewer settled picks edges out). Pending calls are deliberately not counted:
// a record is only what has actually settled, which is also all the board
// shows. Null accuracy (no resolved calls yet) sorts last among ties, not
// first.
export function compareRankableEntries(a: RankableEntry, b: RankableEntry) {
	if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
	const aAccuracy = a.accuracy ?? -1
	const bAccuracy = b.accuracy ?? -1
	if (bAccuracy !== aAccuracy) return bAccuracy - aAccuracy
	return a.resolvedCallCount - b.resolvedCallCount
}

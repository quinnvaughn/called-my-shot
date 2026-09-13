import { db } from "../db"
import type { BallotQuestion, Call } from "../db/schema"

// One user's filled-out ballot. There is no row for this: a ballot pick is an
// ordinary call on one of the ballot's member questions, so an entry is the
// member list with that user's call (or null) beside each one.
export type BallotEntry = {
	members: { member: BallotQuestion; call: Call | null }[]
	calledCount: number
	// Counted the way the ballot page's dots are drawn (ballotMemberState on
	// the web): a settled member is a win if hitTolerance says so, or failing
	// that if any selection landed on a correct option. Unsettled members
	// count toward neither.
	wins: number
	losses: number
	// Sum of every call whose points are final, same rule as CallRef.totalPoints.
	points: number
}

// Null when the user has no calls on this ballot, so an entry page never
// renders for someone who hasn't started it.
export async function loadBallotEntry(
	ballotId: string,
	userId: string,
): Promise<BallotEntry | null> {
	const memberRows = await db.query.ballotQuestions.findMany({
		where: { ballotId },
		orderBy: { sortOrder: "asc" },
		with: { question: { columns: { id: true, status: true } } },
	})
	if (memberRows.length === 0) return null

	const callRows = await db.query.calls.findMany({
		where: {
			userId,
			questionId: { in: memberRows.map((m) => m.questionId) },
		},
		with: {
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})
	if (callRows.length === 0) return null

	const callByQuestionId = new Map(callRows.map((c) => [c.questionId, c]))

	let wins = 0
	let losses = 0
	let points = 0
	const members: BallotEntry["members"] = []

	for (const { question, ...member } of memberRows) {
		const row = callByQuestionId.get(member.questionId)
		if (!row) {
			members.push({ member, call: null })
			continue
		}
		// Handed to CallRef/BallotQuestionRef as bare rows. A partially loaded
		// relation left on the object would be read as the whole relation.
		const { selections, ...call } = row
		members.push({ member, call })

		const totalPoints =
			call.resultPoints ??
			(selections.length > 0 && selections.every((s) => s.resultPoints !== null)
				? selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
				: null)
		if (totalPoints !== null) points += totalPoints

		// An unscored call has no result to count either way.
		if (call.unscoredReason !== null) continue
		const settled =
			question?.status === "resolved" || question?.status === "disputed"
		if (!settled) continue
		const correct =
			call.hitTolerance ?? selections.some((s) => s.option?.isCorrect === true)
		if (correct) wins++
		else losses++
	}

	return { members, calledCount: callRows.length, wins, losses, points }
}

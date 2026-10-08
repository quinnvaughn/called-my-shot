import { db } from "../db"
import type { Call, Question } from "../db/schema"

// One user's calls across a fixed set of questions (a ballot's members, a
// game's official questions), with that set's record and points. There is no
// row for this: the set is the member list with that user's call (or null)
// beside each one.
export type PickEntry<M> = {
	members: { member: M; call: Call | null }[]
	calledCount: number
	// Counted the way the web's set dots are drawn (ballotMemberState): a
	// settled member is a win if hitTolerance says so, or failing that if any
	// selection landed on a correct option. Unsettled members count toward
	// neither.
	wins: number
	losses: number
	// Sum of every call whose points are final, same rule as CallRef.totalPoints.
	points: number
}

// Null when the user has no calls on any member, so an entry page never
// renders for someone who hasn't started the set.
export async function loadPickEntry<M>(
	userId: string,
	memberRows: {
		member: M
		questionId: string
		status: Question["status"] | undefined
	}[],
): Promise<PickEntry<M> | null> {
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

	const members: PickEntry<M>["members"] = []
	const tallied: TallyRow[] = []
	for (const { member, questionId, status } of memberRows) {
		const row = callByQuestionId.get(questionId)
		if (!row) {
			members.push({ member, call: null })
			continue
		}
		// Handed to CallRef as a bare row. A partially loaded relation left on
		// the object would be read as the whole relation.
		const { selections: _selections, ...call } = row
		members.push({ member, call })
		tallied.push({ call: row, status })
	}

	return { members, calledCount: callRows.length, ...tallyCalls(tallied) }
}

export type TallyRow = {
	call: Call & {
		selections: {
			resultPoints: number | null
			option: { isCorrect: boolean | null } | null
		}[]
	}
	status: Question["status"] | undefined
}

// The record and points of a set of one user's calls, counted the way
// PickEntry describes. Shared with the group game board, so a member's row
// there and their own picks page never disagree.
export function tallyCalls(rows: TallyRow[]): {
	wins: number
	losses: number
	points: number
} {
	let wins = 0
	let losses = 0
	let points = 0
	for (const { call, status } of rows) {
		const { selections } = call
		const totalPoints =
			call.resultPoints ??
			(selections.length > 0 && selections.every((s) => s.resultPoints !== null)
				? selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
				: null)
		if (totalPoints !== null) points += totalPoints

		// An unscored call has no result to count either way.
		if (call.unscoredReason !== null) continue
		if (status !== "resolved" && status !== "disputed") continue
		const correct =
			call.hitTolerance ?? selections.some((s) => s.option?.isCorrect === true)
		if (correct) wins++
		else losses++
	}
	return { wins, losses, points }
}

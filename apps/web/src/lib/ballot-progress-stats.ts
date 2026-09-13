import { ballotMemberState } from "./ballot-member-state"
import { isContested, rankByField } from "./contested"

// `call` is the viewer's own call on the member's question.
type BallotMember = {
	question: {
		status: "OPEN" | "LOCKED" | "RESOLVED" | "DISPUTED" | "VOIDED"
		locksAt: string
		callCount: number
		options: { fieldPct: number | null }[]
	}
	call: {
		hitTolerance: boolean | null
		selections: {
			option: { fieldPct: number | null; isCorrect: boolean | null }
		}[]
	} | null
}

// Consolidates the cross-member aggregate math the ballot detail page's
// progress card + continue-ballot CTA need, so the route itself stays a
// thin composition of already-computed numbers.
export function computeBallotProgressStats<T extends BallotMember>(
	members: T[],
) {
	const states = members.map((m) => ballotMemberState(m.question, m.call))
	const calledCount = states.filter(
		(s) => s !== "uncalled" && s !== "missed",
	).length
	const remainingOpenCount = states.filter((s) => s === "uncalled").length
	const isComplete =
		remainingOpenCount === 0 && states.every((s) => s !== "missed")

	const contestedCount = members.filter((m) =>
		isContested(m.question.options, m.question.callCount),
	).length

	// "Off the field": positions you've called where none of your selected
	// option(s) is the field's current leader. Numeric-guess members (no
	// options, no selections) are excluded, not counted either way.
	const offFieldCount = members.filter((m) => {
		const selections = m.call?.selections ?? []
		if (selections.length === 0) return false
		const leaderPct = rankByField(m.question.options)[0]
		if (leaderPct === undefined) return false
		return !selections.some((s) => s.option.fieldPct === leaderPct)
	}).length

	const nextUncalledIndex = states.findIndex((s) => s === "uncalled")
	const nextUncalled = nextUncalledIndex === -1 ? null : members[nextUncalledIndex]

	return {
		states,
		calledCount,
		remainingOpenCount,
		isComplete,
		contestedCount,
		offFieldCount,
		nextUncalled,
	}
}

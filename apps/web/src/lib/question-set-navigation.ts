import type { BallotMemberState } from "./ballot-member-state"

export type QuestionSetNavigation = {
	prevIndex: number | null
	nextIndex: number | null
	// The next uncalled question after the current one, wrapping around to the
	// start. Never the current question itself, so when it's the only uncalled
	// one left there's nowhere to jump.
	nextUncalledIndex: number | null
	resolvedCount: number
	pendingCount: number
	calledCount: number
	wonCount: number
}

// Position within an ordered set of questions (a ballot's members, a game's
// official questions). currentIndex is -1 when the question on screen isn't
// in the set: there is no prev/next then, and the jump goes to the first
// uncalled question.
export function questionSetNavigation(
	states: BallotMemberState[],
	currentIndex: number,
): QuestionSetNavigation {
	const isMember = currentIndex >= 0
	const prevIndex = currentIndex > 0 ? currentIndex - 1 : null
	const nextIndex =
		isMember && currentIndex < states.length - 1 ? currentIndex + 1 : null

	const resolvedCount = states.filter((s) => s === "won" || s === "lost").length
	const pendingCount = states.filter((s) => s === "pending").length
	const wonCount = states.filter((s) => s === "won").length

	const uncalledIndexes = states
		.map((s, i) => (s === "uncalled" ? i : -1))
		.filter((i) => i !== -1 && i !== currentIndex)
	const nextUncalledIndex =
		uncalledIndexes.find((i) => i > currentIndex) ?? uncalledIndexes[0] ?? null

	return {
		prevIndex,
		nextIndex,
		nextUncalledIndex,
		resolvedCount,
		pendingCount,
		calledCount: resolvedCount + pendingCount,
		wonCount,
	}
}

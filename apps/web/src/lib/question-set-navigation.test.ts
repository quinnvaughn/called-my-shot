import { describe, expect, it } from "vitest"
import type { BallotMemberState } from "./ballot-member-state"
import { questionSetNavigation } from "./question-set-navigation"

describe("questionSetNavigation", () => {
	const states: BallotMemberState[] = [
		"won",
		"uncalled",
		"pending",
		"uncalled",
		"lost",
	]

	it("steps to neighbors and stops at either end", () => {
		expect(questionSetNavigation(states, 2)).toMatchObject({
			prevIndex: 1,
			nextIndex: 3,
		})
		expect(questionSetNavigation(states, 0)).toMatchObject({
			prevIndex: null,
			nextIndex: 1,
		})
		expect(questionSetNavigation(states, 4)).toMatchObject({
			prevIndex: 3,
			nextIndex: null,
		})
	})

	it("jumps to the next uncalled question, wrapping, never the current one", () => {
		expect(questionSetNavigation(states, 2).nextUncalledIndex).toBe(3)
		expect(questionSetNavigation(states, 4).nextUncalledIndex).toBe(1)
		expect(questionSetNavigation(states, 3).nextUncalledIndex).toBe(1)
		expect(
			questionSetNavigation(["won", "uncalled"], 1).nextUncalledIndex,
		).toBeNull()
	})

	it("has no neighbors when the question on screen isn't in the set", () => {
		expect(questionSetNavigation(states, -1)).toMatchObject({
			prevIndex: null,
			nextIndex: null,
			nextUncalledIndex: 1,
		})
	})

	it("counts calls and results", () => {
		expect(questionSetNavigation(states, 0)).toMatchObject({
			resolvedCount: 2,
			pendingCount: 1,
			calledCount: 3,
			wonCount: 1,
		})
	})
})

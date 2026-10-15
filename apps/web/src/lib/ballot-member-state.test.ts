import { describe, expect, it } from "vitest"
import { ballotMemberState, selectionDotState } from "./ballot-member-state"

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

const pick = (isCorrect: boolean | null) => ({
	hitTolerance: null,
	selections: [{ option: { isCorrect } }],
})

describe("ballotMemberState", () => {
	it("buckets an unsettled member by whether it was called and has locked", () => {
		expect(ballotMemberState({ status: "OPEN", locksAt: future }, null)).toBe(
			"uncalled",
		)
		expect(
			ballotMemberState({ status: "OPEN", locksAt: future }, pick(null)),
		).toBe("pending")
		// A stale "open" status past its lock time still counts as locked.
		expect(ballotMemberState({ status: "OPEN", locksAt: past }, null)).toBe(
			"missed",
		)
	})

	it("grades a settled member off the call it's given", () => {
		const resolved = { status: "RESOLVED", locksAt: past } as const
		expect(ballotMemberState(resolved, pick(true))).toBe("won")
		expect(ballotMemberState(resolved, pick(false))).toBe("lost")
		expect(
			ballotMemberState(resolved, { hitTolerance: true, selections: [] }),
		).toBe("won")
		expect(ballotMemberState(resolved, null)).toBe("missed")
	})

	it("counts a voided member as called but neither won nor lost", () => {
		const voided = { status: "VOIDED", locksAt: past } as const
		expect(ballotMemberState(voided, pick(true))).toBe("voided")
		expect(ballotMemberState(voided, null)).toBe("missed")
	})
})

describe("selectionDotState", () => {
	it("stays pending until the question settles", () => {
		expect(selectionDotState(true, false)).toBe("pending")
		expect(selectionDotState(null, false)).toBe("pending")
	})

	it("reads each settled selection on its own", () => {
		expect(selectionDotState(true, true)).toBe("won")
		expect(selectionDotState(false, true)).toBe("lost")
		expect(selectionDotState(null, true)).toBe("lost")
	})
})

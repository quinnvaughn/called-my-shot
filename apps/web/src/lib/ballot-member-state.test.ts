import { describe, expect, it } from "vitest"
import { ballotMemberState } from "./ballot-member-state"

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
})

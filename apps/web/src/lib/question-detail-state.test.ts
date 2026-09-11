import { describe, expect, it } from "vitest"
import { questionDetailState, questionPhase } from "./question-detail-state"

const now = Date.now()
const future = new Date(now + 86_400_000).toISOString()
const past = new Date(now - 86_400_000).toISOString()

describe("questionPhase", () => {
	it("reads settled phases straight off the status", () => {
		expect(questionPhase({ status: "RESOLVED", locksAt: past }, now)).toBe(
			"resolved",
		)
		expect(questionPhase({ status: "DISPUTED", locksAt: past }, now)).toBe(
			"disputed",
		)
	})

	it("locks an open question once locksAt passes, even if status never flipped", () => {
		expect(questionPhase({ status: "OPEN", locksAt: future }, now)).toBe("open")
		expect(questionPhase({ status: "OPEN", locksAt: past }, now)).toBe("locked")
		expect(questionPhase({ status: "LOCKED", locksAt: future }, now)).toBe(
			"locked",
		)
	})
})

describe("questionDetailState", () => {
	it("derives every flag from the phase", () => {
		expect(questionDetailState({ status: "OPEN", locksAt: future }, now)).toEqual(
			{
				phase: "open",
				isSettled: false,
				isDisputed: false,
				isLocked: false,
				canCall: true,
			},
		)
		expect(questionDetailState({ status: "OPEN", locksAt: past }, now)).toEqual({
			phase: "locked",
			isSettled: false,
			isDisputed: false,
			isLocked: true,
			canCall: false,
		})
		expect(
			questionDetailState({ status: "DISPUTED", locksAt: past }, now),
		).toEqual({
			phase: "disputed",
			isSettled: true,
			isDisputed: true,
			isLocked: false,
			canCall: false,
		})
	})
})

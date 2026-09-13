import { describe, expect, it } from "vitest"
import { type ContributingCall, callContribution } from "./call-contribution"

const call = (overrides: Partial<ContributingCall> = {}): ContributingCall => ({
	resultPoints: null,
	hitTolerance: null,
	unscoredReason: null,
	selections: [],
	...overrides,
})

const pick = (resultPoints: number | null, isCorrect: boolean | null) => ({
	resultPoints,
	option: { isCorrect },
})

describe("callContribution", () => {
	it("is only the cast itself before anything resolves", () => {
		expect(
			callContribution(call({ selections: [pick(null, null)] }), "open"),
		).toEqual({
			points: 0,
			resolvedCallCount: 0,
			correctCount: 0,
			callCount: 1,
		})
	})

	it("sums every scored pick on an option call", () => {
		expect(
			callContribution(
				call({ selections: [pick(300, true), pick(-150, false)] }),
				"resolved",
			),
		).toEqual({
			points: 150,
			resolvedCallCount: 2,
			correctCount: 1,
			callCount: 1,
		})
	})

	it("reads a numeric guess off the call itself", () => {
		expect(
			callContribution(
				call({ resultPoints: 400, hitTolerance: true }),
				"resolved",
			),
		).toEqual({
			points: 400,
			resolvedCallCount: 1,
			correctCount: 1,
			callCount: 1,
		})
	})

	it("gives an unscored call only its callCount", () => {
		expect(
			callContribution(
				call({
					unscoredReason: "creator_sole_caller",
					selections: [pick(null, true)],
				}),
				"resolved",
			),
		).toEqual({
			points: 0,
			resolvedCallCount: 0,
			correctCount: 0,
			callCount: 1,
		})
	})

	it("gives a call on a voided question nothing at all", () => {
		expect(
			callContribution(
				call({
					unscoredReason: "question_voided",
					selections: [pick(null, null)],
				}),
				"voided",
			),
		).toEqual({
			points: 0,
			resolvedCallCount: 0,
			correctCount: 0,
			callCount: 0,
		})
	})
})

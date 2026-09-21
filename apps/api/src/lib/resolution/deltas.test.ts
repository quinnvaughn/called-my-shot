import { describe, expect, it } from "vitest"
import { deltaFor, negated } from "./deltas"

const unresolved = { resultPoints: null, correct: false }

describe("deltaFor", () => {
	it("adds a first-time hit to every count and both conviction sums", () => {
		expect(deltaFor(unresolved, { points: 300, correct: true }, 80)).toEqual({
			points: 300,
			resolvedCallCount: 1,
			correctCount: 1,
			convictionSum: 80,
			convictionSumCorrect: 80,
			callCount: 0,
		})
	})

	it("banks a first-time miss's conviction on the total sum only", () => {
		expect(deltaFor(unresolved, { points: -100, correct: false }, 35)).toEqual({
			points: -100,
			resolvedCallCount: 1,
			correctCount: 0,
			convictionSum: 35,
			convictionSumCorrect: 0,
			callCount: 0,
		})
	})

	it("nets a re-resolve to the same result to nothing", () => {
		const d = deltaFor(
			{ resultPoints: 300, correct: true },
			{ points: 300, correct: true },
			65,
		)
		expect(Object.values(d).every((v) => v === 0)).toBe(true)
	})

	it("claws back a win that an overturn turns into a loss", () => {
		expect(
			deltaFor(
				{ resultPoints: 300, correct: true },
				{ points: -100, correct: false },
				90,
			),
		).toEqual({
			points: -400,
			resolvedCallCount: 0,
			correctCount: -1,
			convictionSum: 0,
			convictionSumCorrect: -90,
			callCount: 0,
		})
	})

	it("credits a loss that an overturn turns into a win", () => {
		expect(
			deltaFor(
				{ resultPoints: -20, correct: false },
				{ points: 250, correct: true },
				20,
			),
		).toEqual({
			points: 270,
			resolvedCallCount: 0,
			correctCount: 1,
			convictionSum: 0,
			convictionSumCorrect: 20,
			callCount: 0,
		})
	})

	it("takes a scored result back out when the call ends unscored", () => {
		expect(deltaFor({ resultPoints: 300, correct: true }, null, 50)).toEqual({
			points: -300,
			resolvedCallCount: -1,
			correctCount: -1,
			convictionSum: -50,
			convictionSumCorrect: -50,
			callCount: 0,
		})
	})

	it("moves nothing for a call that was never scored and still isn't", () => {
		const d = deltaFor(unresolved, null, 50)
		expect(Object.values(d).every((v) => v === 0)).toBe(true)
	})

	it("ignores a stale correct flag on a result that was never scored", () => {
		expect(
			deltaFor(
				{ resultPoints: null, correct: true },
				{ points: -50, correct: false },
				50,
			).correctCount,
		).toBe(0)
	})
})

describe("negated", () => {
	it("flips every field", () => {
		expect(
			negated({
				points: 5,
				resolvedCallCount: 1,
				correctCount: 1,
				convictionSum: 40,
				convictionSumCorrect: 40,
				callCount: 1,
			}),
		).toEqual({
			points: -5,
			resolvedCallCount: -1,
			correctCount: -1,
			convictionSum: -40,
			convictionSumCorrect: -40,
			callCount: -1,
		})
	})
})

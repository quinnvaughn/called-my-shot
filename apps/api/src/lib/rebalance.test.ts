import { describe, expect, it } from "vitest"
import { rebalanceProblem } from "./rebalance"

// Four teams of a 2-game season: the schedule hands out exactly 4 wins.
const check = (
	picks: number[],
	changes: [number, number][],
	gamesPerSeason = 2,
) =>
	rebalanceProblem({
		current: new Map(picks.map((v, i) => [`q${i}`, v])),
		changes: changes.map(([i, guessValue]) => ({
			questionId: `q${i}`,
			guessValue,
		})),
		target: (gamesPerSeason * picks.length) / 2,
		gamesPerSeason,
	})

describe("rebalanceProblem", () => {
	it("lets an over ballot lower picks up to what it's over", () => {
		// 7 picked against 4: 3 over.
		expect(
			check(
				[2, 2, 2, 1],
				[
					[0, 1],
					[1, 0],
				],
			),
		).toBeNull()
		expect(
			check(
				[2, 2, 2, 1],
				[
					[0, 0],
					[1, 0],
				],
			),
		).toBe("That takes back more than the 3 wins you're over.")
	})

	it("allows stopping short of the schedule's total", () => {
		expect(check([2, 2, 2, 2], [[0, 1]])).toBeNull()
	})

	it("lets an under ballot raise picks, never past the total", () => {
		expect(check([0, 0, 1, 1], [[0, 2]])).toBeNull()
		expect(
			check(
				[0, 0, 1, 1],
				[
					[0, 2],
					[1, 1],
				],
			),
		).toBe("That adds more than the 2 wins you're under.")
	})

	it("only moves picks in the direction that fixes the count", () => {
		expect(check([2, 2, 2, 1], [[3, 2]])).toBe(
			"You're over the schedule's total, so a rebalance can only lower picks.",
		)
		expect(check([0, 0, 1, 1], [[2, 0]])).toBe(
			"You're under the schedule's total, so a rebalance can only raise picks.",
		)
	})

	it("refuses a ballot that already adds up", () => {
		expect(check([1, 1, 1, 1], [[0, 0]])).toBe(
			"Your picks already add up to the 4 wins the schedule hands out.",
		)
	})

	it("refuses values outside a season", () => {
		expect(check([2, 2, 2, 1], [[0, -1]])).toBe(
			"A win total has to be a whole number from 0 to 2.",
		)
		expect(check([2, 2, 2, 1], [[0, 1.5]])).toBe(
			"A win total has to be a whole number from 0 to 2.",
		)
	})
})

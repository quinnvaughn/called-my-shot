import { describe, expect, it } from "vitest"
import {
	BASE_POINTS_BY_SHAPE,
	breakEvenHitRate,
	LOSS_RATE_BY_SHAPE,
	pointsCommitted,
	type QuestionShape,
	selectionPoints,
} from "./index"
import {
	callReturnVariance,
	GRADE_BANDS,
	gradeForReturn,
	REPORT_CARD_MIN_SETTLED,
	returnOnCommitted,
	returnScore,
	returnStandardError,
} from "./report-card"

describe("returnOnCommitted", () => {
	it("is net over committed, as a percent", () => {
		expect(returnOnCommitted(320, 1000)).toBeCloseTo(32)
		expect(returnOnCommitted(-150, 1000)).toBeCloseTo(-15)
		expect(returnOnCommitted(0, 1000)).toBe(0)
	})

	it("is null when nothing was committed", () => {
		// Every call still pending, or a window with no calls at all.
		expect(returnOnCommitted(0, 0)).toBeNull()
		expect(returnOnCommitted(500, 0)).toBeNull()
	})

	// The property the whole grade rests on: at a x1 multiplier the return is
	// purely how far a caller got from their shapes' break-even rate toward
	// perfect, so a shape's loss rate drops out entirely. If this ever fails,
	// the grade has stopped being comparable across shapes.
	it("reduces to (hitRate - breakEven) / (1 - breakEven) for every shape", () => {
		const shapes: QuestionShape[] = [
			"yes_no_prop",
			"player_stat_over_under",
			"player_stat_numeric_guess",
			"team_season_award",
			"player_game_stat_leader",
		]
		for (const shape of shapes) {
			const base = BASE_POINTS_BY_SHAPE[shape]
			const lossRate = LOSS_RATE_BY_SHAPE[shape]
			const breakEven = breakEvenHitRate(lossRate)

			for (const fractionOfTheWay of [0, 0.25, 0.5, 1]) {
				// Pick a call count that lands exactly on the target hit rate.
				const total = 1000
				const hitRate = breakEven + fractionOfTheWay * (1 - breakEven)
				const wins = Math.round(total * hitRate)
				const losses = total - wins

				// fieldPct 50 on a binary question is the x1 tier floor, and a
				// neutral early multiplier keeps this to the bare formula.
				const net =
					wins * selectionPoints(base, lossRate, 50, 2, 100, true, 1) +
					losses * selectionPoints(base, lossRate, 50, 2, 100, false, 1)
				const committed = total * pointsCommitted(base, 100)

				expect(returnOnCommitted(net, committed)).toBeCloseTo(
					fractionOfTheWay * 100,
					0,
				)
			}
		}
	})
})

describe("callReturnVariance", () => {
	// The claim the whole grade leans on: at the break-even hit rate, one
	// call's return on committed has a standard deviation of sqrt(lossRate).
	// Checked against the real payout function, so a change to how hits or
	// misses score shows up here.
	it("matches the real payout's spread at break-even for any loss rate", () => {
		const base = BASE_POINTS_BY_SHAPE.player_game_stat_leader
		for (const lossRate of [0.05, 0.23, 0.5, 1]) {
			const committed = pointsCommitted(base, 100)
			const hit = selectionPoints(base, lossRate, 50, 2, 100, true, 1)
			const miss = selectionPoints(base, lossRate, 50, 2, 100, false, 1)
			const p = breakEvenHitRate(lossRate)
			const actualSd =
				(Math.sqrt(p * (1 - p)) * (hit - miss)) / committed
			const modelSd =
				Math.sqrt(callReturnVariance(committed, lossRate)) / committed
			expect(modelSd).toBeCloseTo(actualSd, 2)
		}
	})
})

describe("returnStandardError", () => {
	it("is 100 / sqrt(n) for n equal calls at a 1.0 loss rate", () => {
		const committed = 75
		const n = 25
		const variance = n * callReturnVariance(committed, 1)
		expect(returnStandardError(n * committed, variance)).toBeCloseTo(20)
	})

	it("shrinks with a cheaper miss", () => {
		const at = (lossRate: number) =>
			returnStandardError(750, 10 * callReturnVariance(75, lossRate))
		expect(at(0.05)).toBeLessThan(at(0.25) ?? 0)
		expect(at(0.25)).toBeCloseTo((at(1) ?? 0) / 2)
	})

	it("grows when one call carries most of the commitment", () => {
		const even = returnStandardError(1000, 10 * callReturnVariance(100, 1))
		const lopsided = returnStandardError(
			1000,
			callReturnVariance(910, 1) + 9 * callReturnVariance(10, 1),
		)
		expect(lopsided).toBeGreaterThan((even ?? 0) * 2)
	})

	it("is null with nothing committed", () => {
		expect(returnStandardError(0, 0)).toBeNull()
	})
})

describe("returnScore", () => {
	it("is the return in standard errors", () => {
		expect(returnScore(30, 20)).toBeCloseTo(1.5)
		expect(returnScore(-10, 20)).toBeCloseTo(-0.5)
	})
})

describe("gradeForReturn", () => {
	it("takes the first band the score clears", () => {
		const at = (score: number) => gradeForReturn(score * 20, 20)
		expect(at(3)).toBe("A+")
		expect(at(2)).toBe("A+")
		expect(at(1.99)).toBe("A")
		expect(at(1.25)).toBe("A")
		expect(at(1.24)).toBe("B")
		expect(at(0.5)).toBe("B")
		expect(at(0.49)).toBe("C")
		expect(at(0)).toBe("C")
		expect(at(-0.5)).toBe("C")
		expect(at(-0.51)).toBe("D")
		expect(at(-1.5)).toBe("D")
		expect(at(-1.51)).toBe("F")
	})

	it("grades the same return harder the more calls stand behind it", () => {
		// n equal over/unders, where the standard error is 100 / sqrt(n).
		const overUnders = (returnPct: number, n: number) =>
			gradeForReturn(returnPct, 100 / Math.sqrt(n))
		expect(overUnders(-7.1, 92)).toBe("D")
		expect(overUnders(-7.1, 6)).toBe("C")
		expect(overUnders(43, 7)).toBe("B")
		expect(overUnders(43, 92)).toBe("A+")
	})

	it("has no grade for a window that committed nothing", () => {
		expect(gradeForReturn(null, 10)).toBeNull()
		expect(gradeForReturn(0, null)).toBeNull()
	})

	it("covers every score with exactly one band, ordered high to low", () => {
		const mins = GRADE_BANDS.map((band) => band.min)
		expect(mins).toStrictEqual([...mins].sort((a, b) => b - a))
		expect(mins.at(-1)).toBe(Number.NEGATIVE_INFINITY)
		expect(new Set(GRADE_BANDS.map((b) => b.grade)).size).toBe(
			GRADE_BANDS.length,
		)
	})

	it("puts break-even in the middle of C at any standard error", () => {
		for (const se of [5, 20, 45, 100]) {
			expect(gradeForReturn(0, se)).toBe("C")
		}
	})
})

describe("REPORT_CARD_MIN_SETTLED", () => {
	it("is above one, which is the count a single lucky call would exploit", () => {
		expect(REPORT_CARD_MIN_SETTLED).toBeGreaterThan(1)
	})
})

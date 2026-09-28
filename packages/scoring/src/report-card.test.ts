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
	CALL_RETURN_SPREAD,
	effectiveCallCount,
	GRADE_BANDS,
	gradeForReturn,
	REPORT_CARD_MIN_SETTLED,
	returnOnCommitted,
	returnScore,
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

describe("effectiveCallCount", () => {
	it("is the plain count when every call committed the same", () => {
		// Ten calls at 75 each.
		expect(effectiveCallCount(750, 10 * 75 * 75)).toBeCloseTo(10)
	})

	it("shrinks when one call dominates the commitment", () => {
		// One call at 1000 beside ten at 10.
		const committed = 1000 + 10 * 10
		const squares = 1000 * 1000 + 10 * 10 * 10
		const n = effectiveCallCount(committed, squares)
		expect(n).toBeGreaterThan(1)
		expect(n).toBeLessThan(1.5)
	})

	it("is zero with nothing committed", () => {
		expect(effectiveCallCount(0, 0)).toBe(0)
	})
})

describe("returnScore", () => {
	it("is the return over the spread at one call", () => {
		expect(returnScore(CALL_RETURN_SPREAD, 1)).toBeCloseTo(1)
	})

	it("grows with the square root of the sample", () => {
		expect(returnScore(10, 100)).toBeCloseTo(returnScore(10, 25) * 2)
	})
})

describe("gradeForReturn", () => {
	it("takes the first band the score clears", () => {
		// At 25 calls the standard error is 95 / 5 = 19, so each band edge
		// sits at 19 x its score.
		const at = (score: number) => gradeForReturn(score * 19, 25)
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
		// A clearly losing 92-call week, and the same return over a handful.
		expect(gradeForReturn(-7.1, 92)).toBe("D")
		expect(gradeForReturn(-7.1, 6)).toBe("C")
		// A hot 7-call stretch is mostly luck; the same pace over 92 is not.
		expect(gradeForReturn(43, 7)).toBe("B")
		expect(gradeForReturn(43, 92)).toBe("A+")
	})

	it("has no grade for a window that committed nothing", () => {
		expect(gradeForReturn(null, 10)).toBeNull()
		expect(gradeForReturn(0, 0)).toBeNull()
	})

	it("covers every score with exactly one band, ordered high to low", () => {
		const mins = GRADE_BANDS.map((band) => band.min)
		expect(mins).toStrictEqual([...mins].sort((a, b) => b - a))
		expect(mins.at(-1)).toBe(Number.NEGATIVE_INFINITY)
		expect(new Set(GRADE_BANDS.map((b) => b.grade)).size).toBe(
			GRADE_BANDS.length,
		)
	})

	it("puts break-even in the middle of C at any sample size", () => {
		for (const n of [5, 12, 30, 92, 500]) {
			expect(gradeForReturn(0, n)).toBe("C")
		}
	})
})

describe("REPORT_CARD_MIN_SETTLED", () => {
	it("is above one, which is the count a single lucky call would exploit", () => {
		expect(REPORT_CARD_MIN_SETTLED).toBeGreaterThan(1)
	})
})

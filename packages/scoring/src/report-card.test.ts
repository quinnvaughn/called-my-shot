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
	GRADE_BANDS,
	gradeForReturn,
	REPORT_CARD_MIN_SETTLED,
	returnOnCommitted,
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

describe("gradeForReturn", () => {
	it("takes the first band the return clears", () => {
		expect(gradeForReturn(120)).toBe("A+")
		expect(gradeForReturn(50)).toBe("A+")
		expect(gradeForReturn(49.9)).toBe("A")
		expect(gradeForReturn(32)).toBe("A")
		expect(gradeForReturn(31.9)).toBe("B")
		expect(gradeForReturn(10)).toBe("B")
		expect(gradeForReturn(9.9)).toBe("C")
		expect(gradeForReturn(0)).toBe("C")
		expect(gradeForReturn(-8)).toBe("C")
		expect(gradeForReturn(-8.1)).toBe("D")
		expect(gradeForReturn(-32)).toBe("D")
		expect(gradeForReturn(-32.1)).toBe("F")
		expect(gradeForReturn(-100)).toBe("F")
	})

	it("has no grade for a window that committed nothing", () => {
		expect(gradeForReturn(null)).toBeNull()
	})

	it("covers every return with exactly one band, ordered high to low", () => {
		const mins = GRADE_BANDS.map((band) => band.min)
		expect(mins).toStrictEqual([...mins].sort((a, b) => b - a))
		expect(mins.at(-1)).toBe(Number.NEGATIVE_INFINITY)
		expect(new Set(GRADE_BANDS.map((b) => b.grade)).size).toBe(
			GRADE_BANDS.length,
		)
	})

	it("puts break-even inside C rather than at its floor", () => {
		// Zero is an ordinary window, not a bad one - it should sit in the
		// middle of the average grade, with room below it.
		expect(gradeForReturn(0)).toBe("C")
		expect(gradeForReturn(-5)).toBe("C")
	})
})

describe("REPORT_CARD_MIN_SETTLED", () => {
	it("is above one, which is the count a single lucky call would exploit", () => {
		expect(REPORT_CARD_MIN_SETTLED).toBeGreaterThan(1)
	})
})

import { describe, expect, it } from "vitest"
import type { ToleranceSpec } from "./index"
import { callMargin } from "./margin"

// The real tiers from apps/api's db/catalog/stats.ts, so these tests move if
// the catalog does rather than passing against numbers nothing uses.
const STANDARD: ToleranceSpec = { mode: "percentage", pct: 0.15 }
const HIGH_VOLUME: ToleranceSpec = { mode: "percentage", pct: 0.1 }
const BATTING_AVERAGE: ToleranceSpec = { mode: "absolute", amount: 0.02 }
const NFL_WIN_TOTAL: ToleranceSpec = { mode: "absolute", amount: 1 }

describe("callMargin, line basis", () => {
	// The regression that matters most. A low-count stat's line sits at 0.5 or
	// 2.5, the scaled band floors to 1 at both ends, and every possible result
	// would otherwise earn a label - actual 1 "narrow", actual 2 "runaway".
	// A flavor that fires on every outcome is not a flavor.
	it("gives a low-count stat no verdict at any outcome", () => {
		for (const actual of [0, 1, 2, 3]) {
			const margin = callMargin(
				{ kind: "line", actual, line: 0.5, spec: STANDARD },
				actual > 0.5,
			)
			expect(margin?.verdict, `home runs, actual ${actual}`).toBeNull()
		}
		for (const actual of [0, 1, 2, 3, 4, 5]) {
			const margin = callMargin(
				{ kind: "line", actual, line: 2.5, spec: STANDARD },
				actual > 2.5,
			)
			expect(margin?.verdict, `sacks, actual ${actual}`).toBeNull()
		}
		for (const actual of [2, 4, 5, 7]) {
			const margin = callMargin(
				{ kind: "line", actual, line: 4.5, spec: STANDARD },
				actual > 4.5,
			)
			expect(margin?.verdict, `receptions, actual ${actual}`).toBeNull()
		}
	})

	// Skipping the verdict is not the same as hiding the number: the card still
	// states how far off a low-count call landed, it just doesn't call it
	// remarkable.
	it("still reports the distance on a low-count stat", () => {
		const margin = callMargin(
			{ kind: "line", actual: 1, line: 0.5, spec: STANDARD },
			true,
		)
		expect(margin).toEqual({
			distance: 0.5,
			displayDistance: 1,
			verdict: null,
		})
	})

	// The prompting case: a line always sits on a half, so the raw distance is
	// 0.5 and printing it claims a half-yard result that cannot happen.
	it("rounds a counting stat up to a result that could actually happen", () => {
		const margin = callMargin(
			{ kind: "line", actual: 224, line: 224.5, spec: HIGH_VOLUME },
			false,
		)
		expect(margin?.distance).toBe(0.5)
		expect(margin?.displayDistance).toBe(1)
		expect(margin?.verdict).toBe("narrow")
	})

	it("bands a high-volume line", () => {
		// narrow <= floor(224.5 * 0.1 * 0.35) = 7
		const narrow = callMargin(
			{ kind: "line", actual: 230, line: 224.5, spec: HIGH_VOLUME },
			true,
		)
		expect(narrow?.verdict).toBe("narrow")

		// runaway >= floor(224.5 * 0.1 * 2) = 44
		const runaway = callMargin(
			{ kind: "line", actual: 290, line: 224.5, spec: HIGH_VOLUME },
			true,
		)
		expect(runaway?.verdict).toBe("runaway")

		const neither = callMargin(
			{ kind: "line", actual: 245, line: 224.5, spec: HIGH_VOLUME },
			true,
		)
		expect(neither?.verdict).toBeNull()
	})

	it("bands an NBA points line, where the narrow cutoff is one point", () => {
		// floor(24.5 * 0.15 * 0.35) = 1, which is above the degenerate floor.
		const narrow = callMargin(
			{ kind: "line", actual: 24, line: 24.5, spec: STANDARD },
			false,
		)
		expect(narrow?.verdict).toBe("narrow")
		const neither = callMargin(
			{ kind: "line", actual: 28, line: 24.5, spec: STANDARD },
			true,
		)
		expect(neither?.verdict).toBeNull()
	})

	it("exempts a rate stat from the low-count skip and keeps its precision", () => {
		const margin = callMargin(
			{ kind: "line", actual: 0.298, line: 0.3, spec: BATTING_AVERAGE },
			false,
		)
		expect(margin?.verdict).toBe("narrow")
		// Not rounded up to 1: there is no integer grid for a batting average.
		expect(margin?.displayDistance).toBeCloseTo(0.002, 5)
	})

	// A win total snapshots an absolute band too, but it is a whole number of
	// wins, so it still rounds for display.
	it("rounds an absolute-mode counting stat up", () => {
		const margin = callMargin(
			{ kind: "line", actual: 10, line: 9.5, spec: NFL_WIN_TOTAL },
			true,
		)
		expect(margin?.displayDistance).toBe(1)
	})

	// game_total_over_under and team_vs_team carry no stat row, so they lean on
	// the Standard tier rather than going unbanded. On a 224.5 total that is
	// narrow <= 11, runaway >= 67.
	it("falls back to the Standard tier when the shape has no stat", () => {
		const narrow = callMargin(
			{ kind: "line", actual: 229.5, line: 224.5, spec: null },
			true,
		)
		expect(narrow?.verdict).toBe("narrow")

		const neither = callMargin(
			{ kind: "line", actual: 244.5, line: 224.5, spec: null },
			true,
		)
		expect(neither?.verdict).toBeNull()

		const runaway = callMargin(
			{ kind: "line", actual: 300, line: 224.5, spec: null },
			true,
		)
		expect(runaway?.verdict).toBe("runaway")
	})

	it("returns null on a push and on a zero line", () => {
		expect(
			callMargin(
				{ kind: "line", actual: 47, line: 47, spec: STANDARD },
				true,
			),
		).toBeNull()
		expect(
			callMargin({ kind: "line", actual: 3, line: 0, spec: STANDARD }, true),
		).toBeNull()
	})
})

describe("callMargin, guess basis", () => {
	// band = max(1, floor(80 * 0.15)) = 12
	const actual = 80

	it("calls a hit deep in its band narrow", () => {
		const margin = callMargin(
			{ kind: "guess", guess: 70, actual, spec: STANDARD },
			true,
		)
		expect(margin?.verdict).toBe("narrow")
	})

	it("leaves a comfortable hit unflavored and never calls one a runaway", () => {
		const margin = callMargin(
			{ kind: "guess", guess: 78, actual, spec: STANDARD },
			true,
		)
		expect(margin?.verdict).toBeNull()
	})

	it("calls a miss just past the band narrow", () => {
		const margin = callMargin(
			{ kind: "guess", guess: 95, actual, spec: STANDARD },
			false,
		)
		expect(margin?.verdict).toBe("narrow")
	})

	it("calls a miss three bands out a runaway", () => {
		const margin = callMargin(
			{ kind: "guess", guess: 120, actual, spec: STANDARD },
			false,
		)
		expect(margin?.verdict).toBe("runaway")
	})

	it("gives a low-count guess no verdict", () => {
		// actual 1 steal: the band floors to 1, so guessing 3 would otherwise
		// read as "inches away" at three times the answer.
		const margin = callMargin(
			{ kind: "guess", guess: 3, actual: 1, spec: STANDARD },
			false,
		)
		expect(margin?.verdict).toBeNull()
		expect(margin?.distance).toBe(2)
	})

	it("refuses to describe geometry that disagrees with the points", () => {
		// Inside the band but recorded as a loss: the stored actual moved after
		// this call was scored, and a label here would contradict the ledger.
		expect(
			callMargin({ kind: "guess", guess: 78, actual, spec: STANDARD }, false),
		).toBeNull()
		expect(
			callMargin({ kind: "guess", guess: 120, actual, spec: STANDARD }, true),
		).toBeNull()
	})
})

describe("callMargin, gap basis", () => {
	it("calls a one score game narrow", () => {
		expect(
			callMargin({ kind: "gap", winner: 24, other: 21 }, true)?.verdict,
		).toBe("narrow")
		expect(
			callMargin({ kind: "gap", winner: 27, other: 24 }, true)?.verdict,
		).toBe("narrow")
	})

	it("calls a rout a runaway", () => {
		const margin = callMargin({ kind: "gap", winner: 34, other: 3 }, true)
		expect(margin?.verdict).toBe("runaway")
		expect(margin?.displayDistance).toBe(31)
	})

	it("leaves a two score game unflavored", () => {
		expect(
			callMargin({ kind: "gap", winner: 24, other: 17 }, true)?.verdict,
		).toBeNull()
	})

	// This is what leaves a stat-leader WIN with no margin: scoredOptions trims
	// leader shapes to the correct option, so the caller's own pick and the
	// winner are the same row.
	it("returns null when both sides hold the same number", () => {
		expect(callMargin({ kind: "gap", winner: 118, other: 118 }, true)).toBeNull()
	})

	it("returns null when nothing was put up at all", () => {
		expect(callMargin({ kind: "gap", winner: 0, other: 0 }, false)).toBeNull()
	})

	it("measures a leader miss from the leader's own total", () => {
		const margin = callMargin({ kind: "gap", winner: 118, other: 96 }, false)
		expect(margin?.distance).toBe(22)
		expect(margin?.verdict).toBeNull()
	})
})

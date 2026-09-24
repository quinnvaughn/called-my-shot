import { describe, expect, it } from "vitest"
import { type CallGifView, callGifState } from "./call-gif"

function view(overrides: Partial<CallGifView> = {}): CallGifView {
	return {
		isWin: true,
		points: 10,
		questionStatus: "RESOLVED",
		closeness: null,
		margin: null,
		redo: null,
		...overrides,
	}
}

describe("callGifState", () => {
	it("reads a call with no points yet as pending", () => {
		expect(callGifState(view({ points: null, isWin: null }))).toBe("pending")
	})

	// A voided question never resolves, so it would otherwise sit on the
	// pending gif forever, waiting on a result that isn't coming.
	it("puts voided ahead of pending, since a void is also unresolved", () => {
		expect(
			callGifState(
				view({ points: null, isWin: null, questionStatus: "VOIDED" }),
			),
		).toBe("voided")
	})

	it("calls an exact guess nailed, over any margin it also earned", () => {
		expect(
			callGifState(
				view({ closeness: { kind: "exact" }, margin: { verdict: "runaway" } }),
			),
		).toBe("nailed")
	})

	// The whole reason the abandoned pick is kept: a miss that would have been
	// a hit has a better gif than a miss.
	it("puts should_have_stuck ahead of the loss margins", () => {
		expect(
			callGifState(
				view({
					isWin: false,
					points: -10,
					margin: { verdict: "runaway" },
					redo: { originalWasCorrect: true },
				}),
			),
		).toBe("should_have_stuck")
	})

	// Null on every numeric shape by design - there is no way to know whether
	// the old number would have cleared the tolerance band.
	it("ignores a redo whose original pick can't be judged", () => {
		expect(
			callGifState(
				view({
					isWin: false,
					points: -10,
					redo: { originalWasCorrect: null },
				}),
			),
		).toBe("missed")
	})

	it("leaves a win after a redo on the ordinary win pools", () => {
		expect(
			callGifState(view({ isWin: true, redo: { originalWasCorrect: true } })),
		).toBe("called_it")
	})

	it("crosses margin verdict with the result", () => {
		expect(callGifState(view({ margin: { verdict: "runaway" } }))).toBe(
			"never_in_doubt",
		)
		expect(callGifState(view({ margin: { verdict: "narrow" } }))).toBe(
			"by_a_hair",
		)
		expect(
			callGifState(
				view({ isWin: false, points: -10, margin: { verdict: "narrow" } }),
			),
		).toBe("inches_away")
		expect(
			callGifState(
				view({ isWin: false, points: -10, margin: { verdict: "runaway" } }),
			),
		).toBe("way_off")
	})

	it("falls back to the plain verdict when the margin wasn't remarkable", () => {
		expect(callGifState(view())).toBe("called_it")
		expect(callGifState(view({ isWin: false, points: -10 }))).toBe("missed")
	})

	// Zero points is a win - the card's own rule is points >= 0, and a call
	// that broke even is not a miss.
	it("treats a zero-point call as a win", () => {
		expect(callGifState(view({ isWin: true, points: 0 }))).toBe("called_it")
	})
})

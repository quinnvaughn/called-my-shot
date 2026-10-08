import { describe, expect, it } from "vitest"
import { hitMultiple, optionPointsPreview } from "./scoring"

// Options carrying just these loss rates, unpriced on the win side.
const rates = (...lossRates: (number | null)[]) =>
	lossRates.map((lossRate) => ({ lossRate }))

describe("hitMultiple", () => {
	it("floors 1 / lossRate", () => {
		expect(hitMultiple(0.25, rates(null, null, null))).toBe(4)
		expect(hitMultiple(0.3, rates(null, null))).toBe(3)
		expect(hitMultiple(0.48, rates(null, null))).toBe(2)
	})

	it("is null where a hit and a miss weigh about the same", () => {
		expect(hitMultiple(0.96, rates(null, null))).toBeNull()
		expect(hitMultiple(1, rates(null, null))).toBeNull()
	})

	it("reads the steepest option rate so it holds for every pick", () => {
		expect(hitMultiple(0.96, rates(0.2, 1.8))).toBeNull()
		expect(hitMultiple(0.25, rates(0.25, 0.5))).toBe(2)
	})

	it("weighs a priced side's bigger win against its miss", () => {
		// The underdog's hit outweighs about two misses, but the favorite's
		// barely outweighs half of one, so nothing holds for every pick.
		expect(
			hitMultiple(0.96, [
				{ lossRate: 0.96, winMult: 1.84 },
				{ lossRate: 1.8, winMult: 1 },
			]),
		).toBeNull()
		expect(hitMultiple(0.25, [{ lossRate: 0.25, winMult: 2 }])).toBe(8)
	})

	it("falls back to the question's rate with no options", () => {
		expect(hitMultiple(0.5, [])).toBe(2)
	})

	it("is null for a non-positive rate", () => {
		expect(hitMultiple(0, [])).toBeNull()
	})
})

describe("optionPointsPreview", () => {
	// A 7-1 split on who-wins, before the viewer has called it.
	const question = {
		shape: "TEAM_VS_TEAM" as const,
		isOfficial: true,
		lossRate: 0.96,
		callCount: 8,
	}
	const unpriced = { lossRate: null, winMult: null, modelHitRate: null }

	it("pays the side the field left alone more than the one it piled onto", () => {
		const underdog = optionPointsPreview(
			question,
			{ ...unpriced, callCount: 1 },
			2,
			50,
		)
		const favorite = optionPointsPreview(
			question,
			{ ...unpriced, callCount: 7 },
			2,
			50,
		)
		expect(underdog.win).toBeGreaterThan(favorite.win)
		expect(underdog.lose).toBe(favorite.lose)
	})

	it("prices a side at its own win multiplier and loss rate", () => {
		const priced = optionPointsPreview(
			question,
			{ callCount: 1, lossRate: 0.5, winMult: 1, modelHitRate: 0.3 },
			2,
			50,
		)
		const unpricedSide = optionPointsPreview(
			question,
			{ ...unpriced, callCount: 1 },
			2,
			50,
		)
		expect(priced.lose).toBeLessThan(unpricedSide.lose)
		// The field took it about as often as its price expects, so its rarity
		// pays less than it would unpriced.
		expect(priced.win).toBeLessThan(unpricedSide.win)
	})

	it("pays an underdog's win multiplier on top of its rarity", () => {
		const side = { callCount: 1, lossRate: 0.96, modelHitRate: 0.25 }
		const underdog = optionPointsPreview(
			question,
			{ ...side, winMult: 1.84 },
			2,
			50,
		)
		const flat = optionPointsPreview(question, { ...side, winMult: 1 }, 2, 50)
		expect(underdog.win).toBeGreaterThan(flat.win)
		expect(underdog.lose).toBe(flat.lose)
	})

	it("scales with conviction", () => {
		const at = (conviction: number) =>
			optionPointsPreview(question, { ...unpriced, callCount: 1 }, 2, conviction)
		expect(at(100).win).toBeGreaterThan(at(50).win)
		expect(at(100).lose).toBeGreaterThan(at(50).lose)
	})

	it("counts a season-long question's early bonus before a call exists", () => {
		const season = {
			...question,
			shape: "TEAM_VS_TEAM_SEASON" as const,
			seasonGamesPlayed: 0,
			seasonTotalGames: 100,
		}
		const early = optionPointsPreview(season, { ...unpriced, callCount: 4 }, 2, 50)
		const late = optionPointsPreview(
			{ ...season, seasonGamesPlayed: 100 },
			{ ...unpriced, callCount: 4 },
			2,
			50,
		)
		expect(early.win).toBeGreaterThan(late.win)
	})
})

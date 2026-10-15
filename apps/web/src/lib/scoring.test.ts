import { describe, expect, it } from "vitest"
import { hitMultiple, optionPointsPreview, pickMeta } from "./scoring"

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
	// A 7-1 split on who-wins at 50 conviction each, before the viewer has
	// called it.
	const question = {
		shape: "TEAM_VS_TEAM" as const,
		isOfficial: true,
		isPriced: false,
		lossRate: 0.96,
		fieldConviction: 400,
	}
	const unpriced = { lossRate: null, winMult: null, modelHitRate: null }

	it("pays the side the field left alone more than the one it piled onto", () => {
		const underdog = optionPointsPreview(
			question,
			{ ...unpriced, convictionTotal: 50 },
			2,
			50,
		)
		const favorite = optionPointsPreview(
			question,
			{ ...unpriced, convictionTotal: 350 },
			2,
			50,
		)
		expect(underdog.win).toBeGreaterThan(favorite.win)
		expect(underdog.lose).toBe(favorite.lose)
	})

	it("scales a series call's win and loss by its stage", () => {
		const side = { ...unpriced, convictionTotal: 200 }
		const full = optionPointsPreview(question, side, 2, 50)
		const late = optionPointsPreview(
			{ ...question, seriesStage: { weight: 0.5 } },
			side,
			2,
			50,
		)
		expect(late.lose).toBe(Math.round(full.lose / 2))
		expect(late.win).toBeLessThan(full.win)
	})

	it("prices a side at its own win multiplier and loss rate", () => {
		const priced = optionPointsPreview(
			question,
			{ convictionTotal: 50, lossRate: 0.5, winMult: 1, modelHitRate: 0.3 },
			2,
			50,
		)
		const unpricedSide = optionPointsPreview(
			question,
			{ ...unpriced, convictionTotal: 50 },
			2,
			50,
		)
		expect(priced.lose).toBeLessThan(unpricedSide.lose)
		// A priced side has no boldness, so its win pays less than the same
		// share of the field pays unpriced.
		expect(priced.win).toBeLessThan(unpricedSide.win)
	})

	it("pays an underdog's win multiplier, with no boldness on a priced side", () => {
		const side = { convictionTotal: 50, lossRate: 0.96, modelHitRate: 0.25 }
		const underdog = optionPointsPreview(
			question,
			{ ...side, winMult: 1.84 },
			2,
			50,
		)
		const flat = optionPointsPreview(question, { ...side, winMult: 1 }, 2, 50)
		expect(underdog.win).toBeGreaterThan(flat.win)
		expect(underdog.lose).toBe(flat.lose)
		expect(underdog.tier).toBeNull()
	})

	it("counts a priced community question at the full base, an unpriced one at less", () => {
		const community = { ...question, isOfficial: false }
		const side = { ...unpriced, convictionTotal: 50 }
		const official = optionPointsPreview(question, side, 2, 50)
		expect(
			optionPointsPreview({ ...community, isPriced: true }, side, 2, 50).lose,
		).toBe(official.lose)
		expect(optionPointsPreview(community, side, 2, 50).lose).toBeLessThan(
			official.lose,
		)
	})

	it("scales with conviction", () => {
		const at = (conviction: number) =>
			optionPointsPreview(
				question,
				{ ...unpriced, convictionTotal: 50 },
				2,
				conviction,
			)
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
		const early = optionPointsPreview(
			season,
			{ ...unpriced, convictionTotal: 200 },
			2,
			50,
		)
		const late = optionPointsPreview(
			{ ...season, seasonGamesPlayed: 100 },
			{ ...unpriced, convictionTotal: 200 },
			2,
			50,
		)
		expect(early.win).toBeGreaterThan(late.win)
	})
})

describe("pickMeta", () => {
	const unpriced = { winMult: null, modelHitRate: null }

	it("gives an unpriced pick its tier and field share", () => {
		expect(pickMeta({ label: "Bold", mult: 2 }, 12.4, 1, unpriced)).toEqual([
			"Bold",
			"12% of points on this side",
		])
	})

	it("drops the tier when the pick has none", () => {
		expect(pickMeta(null, 50, 1, unpriced)).toEqual([
			"50% of points on this side",
		])
	})

	it("names a priced underdog by its win multiple, with no tier", () => {
		expect(
			pickMeta({ label: "Bold", mult: 2 }, 20, 1, {
				winMult: 2.5,
				modelHitRate: 0.3,
			}),
		).toEqual(["×2.5 underdog", "20% of points on this side", "30% expected"])
	})

	it("names a priced favorite by its loss rate", () => {
		expect(pickMeta(null, 80, 1.6, { winMult: 1, modelHitRate: 0.7 })).toEqual([
			"×1.6 favorite",
			"80% of points on this side",
			"70% expected",
		])
	})

	it("names no price on an even priced side", () => {
		expect(pickMeta(null, 50, 1, { winMult: null, modelHitRate: 0.5 })).toEqual(
			["50% of points on this side", "50% expected"],
		)
	})
})

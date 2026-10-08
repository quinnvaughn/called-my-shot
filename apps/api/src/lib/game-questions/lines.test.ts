import { describe, expect, it } from "vitest"
import {
	blendSamples,
	LINE_FORMULA,
	needsPriorSeason,
	opponentAdjustment,
	perGameSample,
	setLine,
	setTotalLine,
} from "./lines"

const RULE = { minGames: 8, shade: 0.97, minLine: 10.5 }

describe("perGameSample", () => {
	it("divides by the stat category's own games played", () => {
		const stats = new Map([
			["pitching.strikeouts", 60],
			["pitching.gamesPlayed", 20],
			["general.gamesPlayed", 30],
		])
		expect(perGameSample(stats, "pitching.strikeouts")).toEqual({
			mean: 3,
			games: 20,
		})
	})

	it("falls back to the general games played", () => {
		const stats = new Map([
			["offensive.points", 300],
			["general.gamesPlayed", 10],
		])
		expect(perGameSample(stats, "offensive.points")).toEqual({
			mean: 30,
			games: 10,
		})
	})

	it("divides by the named games count when there is one", () => {
		const stats = new Map([
			["pitching.strikeouts", 120],
			["pitching.gamesStarted", 20],
			["pitching.gamesPlayed", 40],
		])
		expect(
			perGameSample(stats, "pitching.strikeouts", "pitching.gamesStarted"),
		).toEqual({ mean: 6, games: 20 })
	})

	it("adds several stats up over the general games played", () => {
		const stats = new Map([
			["rushing.rushingYards", 600],
			["receiving.receivingYards", 200],
			["general.gamesPlayed", 10],
		])
		expect(
			perGameSample(stats, [
				"rushing.rushingYards",
				"receiving.receivingYards",
			]),
		).toEqual({ mean: 80, games: 10 })
	})

	it("reads a stat ESPN left out as zero", () => {
		const stats = new Map([["general.gamesPlayed", 5]])
		expect(perGameSample(stats, "offensive.points")).toEqual({
			mean: 0,
			games: 5,
		})
	})

	it("is null without any games", () => {
		expect(perGameSample(new Map(), "offensive.points")).toBeNull()
	})
})

describe("needsPriorSeason", () => {
	it("wants last season until this one has priorWeight games", () => {
		expect(needsPriorSeason(null, 12)).toBe(true)
		expect(needsPriorSeason({ mean: 30, games: 11 }, 12)).toBe(true)
		expect(needsPriorSeason({ mean: 30, games: 12 }, 12)).toBe(false)
	})
})

describe("blendSamples", () => {
	it("uses this season alone once it has priorWeight games", () => {
		expect(
			blendSamples({ mean: 30, games: 12 }, { mean: 20, games: 80 }, 12),
		).toEqual({ mean: 30, games: 12 })
	})

	it("stands last season in for the games this season hasn't had", () => {
		const blended = blendSamples(
			{ mean: 30, games: 2 },
			{ mean: 20, games: 80 },
			12,
		)
		expect(blended?.games).toBe(12)
		expect(blended?.mean).toBeCloseTo((30 * 2 + 20 * 10) / 12)
	})

	it("never counts last season as more games than it had", () => {
		expect(blendSamples(null, { mean: 20, games: 3 }, 12)).toEqual({
			mean: 20,
			games: 3,
		})
	})

	it("is null with neither season", () => {
		expect(blendSamples(null, null, 12)).toBeNull()
	})
})

describe("setLine", () => {
	it("shades the average and sets the line on a half", () => {
		expect(setLine({ mean: 30, games: 20 }, null, 12, RULE)).toEqual({
			seasonMean: 30,
			seasonGames: 20,
			priorMean: null,
			priorGames: 0,
			priorWeight: 12,
			blendedMean: 30,
			expectedMean: 30,
			opponent: null,
			formula: LINE_FORMULA.teamOnly,
			shade: 0.97,
			line: 29.5,
		})
	})

	it("never lands on a whole number", () => {
		const rule = { ...RULE, shade: 1 }
		expect(setLine({ mean: 25, games: 20 }, null, 12, rule)?.line).toBe(25.5)
	})

	it("sets the line from the blend while this season is short", () => {
		const basis = setLine(
			{ mean: 40, games: 2 },
			{ mean: 25, games: 80 },
			12,
			RULE,
		)
		expect(basis?.blendedMean).toBe(27.5)
		expect(basis?.line).toBe(26.5)
	})

	it("skips a player without enough games", () => {
		expect(setLine({ mean: 30, games: 5 }, null, 12, RULE)).toBeNull()
	})

	it("skips a line under the rule's floor", () => {
		expect(setLine({ mean: 8, games: 20 }, null, 12, RULE)).toBeNull()
	})
})

describe("opponentAdjustment", () => {
	it("leaves an exactly average opponent alone", () => {
		const adjustment = opponentAdjustment({ mean: 22, games: 17 }, 22, 12)
		expect(adjustment?.multiplier).toBe(1)
	})

	// The whole point of the weight: the same figure means far less over two
	// games than over a season, so it moves the line far less.
	it("trusts a long sample more than a short one", () => {
		const short = opponentAdjustment({ mean: 10, games: 2 }, 22, 12)
		const long = opponentAdjustment({ mean: 10, games: 100 }, 22, 12)
		// Two games keep almost all of the league average: 22 + (2/14)(10 - 22)
		// = 20.29, over 22. A hundred keep almost none of it: 22 +
		// (100/112)(10 - 22) = 11.29, over 22.
		expect(short?.multiplier).toBeCloseTo(0.922, 3)
		expect(long?.multiplier).toBeCloseTo(0.513, 3)
		expect(short?.multiplier).toBeGreaterThan(long?.multiplier ?? 0)
	})

	it("moves the line up for a generous opponent and down for a stingy one", () => {
		const generous = opponentAdjustment({ mean: 30, games: 17 }, 22, 12)
		const stingy = opponentAdjustment({ mean: 14, games: 17 }, 22, 12)
		expect(generous?.multiplier).toBeGreaterThan(1)
		expect(stingy?.multiplier).toBeLessThan(1)
	})

	it("is null with no league figure to measure against", () => {
		expect(opponentAdjustment({ mean: 22, games: 17 }, null, 12)).toBeNull()
		expect(opponentAdjustment(null, 22, 12)).toBeNull()
	})
})

describe("setLine with an opponent", () => {
	it("sets the line from the adjusted expectation, not the raw blend", () => {
		const opponent = opponentAdjustment({ mean: 30, games: 100 }, 22, 12)
		const basis = setLine({ mean: 24, games: 20 }, null, 12, RULE, opponent)
		expect(basis?.blendedMean).toBe(24)
		// The blend is untouched; the expectation carries the adjustment.
		expect(basis?.expectedMean).toBeGreaterThan(24)
		expect(basis?.opponent?.multiplier).toBe(opponent?.multiplier)
	})

	it("holds a line to the floor on the adjusted figure", () => {
		const opponent = opponentAdjustment({ mean: 2, games: 500 }, 22, 12)
		expect(
			setLine({ mean: 21, games: 20 }, null, 12, RULE, opponent),
		).toBeNull()
	})
})

describe("setTotalLine", () => {
	const TOTAL_RULE = { minGames: 8, shade: 1, minLine: 150.5 }

	it("adds both sides' expectations and sets the sum on a half", () => {
		const basis = setTotalLine(
			[
				{ season: { mean: 110, games: 20 }, prior: null, opponent: null },
				{ season: { mean: 104.4, games: 20 }, prior: null, opponent: null },
			],
			12,
			TOTAL_RULE,
		)
		expect(basis?.blendedMean).toBe(214.4)
		expect(basis?.expectedMean).toBe(214.4)
		expect(basis?.line).toBe(214.5)
		expect(basis?.formula).toBe(LINE_FORMULA.teamOnly)
	})

	it("moves each side by the defense it faces", () => {
		const generous = opponentAdjustment({ mean: 120, games: 100 }, 110, 13)
		const stingy = opponentAdjustment({ mean: 100, games: 100 }, 110, 13)
		const basis = setTotalLine(
			[
				{ season: { mean: 110, games: 20 }, prior: null, opponent: generous },
				{ season: { mean: 110, games: 20 }, prior: null, opponent: stingy },
			],
			12,
			TOTAL_RULE,
		)
		const expected =
			110 * (generous?.multiplier ?? 1) + 110 * (stingy?.multiplier ?? 1)
		expect(basis?.expectedMean).toBeCloseTo(expected, 3)
		expect(basis?.formula).toBe(LINE_FORMULA.opponentAdjusted)
	})

	it("leaves both sides unadjusted when only one has an opponent figure", () => {
		const generous = opponentAdjustment({ mean: 120, games: 100 }, 110, 13)
		const basis = setTotalLine(
			[
				{ season: { mean: 110, games: 20 }, prior: null, opponent: generous },
				{ season: { mean: 110, games: 20 }, prior: null, opponent: null },
			],
			12,
			TOTAL_RULE,
		)
		expect(basis?.expectedMean).toBe(220)
		expect(basis?.formula).toBe(LINE_FORMULA.teamOnly)
	})

	it("is null when either side is short of games", () => {
		expect(
			setTotalLine(
				[
					{ season: { mean: 110, games: 20 }, prior: null, opponent: null },
					{ season: { mean: 110, games: 3 }, prior: null, opponent: null },
				],
				3,
				TOTAL_RULE,
			),
		).toBeNull()
	})

	it("is null under the rule's floor", () => {
		expect(
			setTotalLine(
				[
					{ season: { mean: 70, games: 20 }, prior: null, opponent: null },
					{ season: { mean: 70, games: 20 }, prior: null, opponent: null },
				],
				12,
				TOTAL_RULE,
			),
		).toBeNull()
	})
})

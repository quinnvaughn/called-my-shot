import { describe, expect, it } from "vitest"
import { blendSamples, needsPriorSeason, perGameSample, setLine } from "./lines"

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

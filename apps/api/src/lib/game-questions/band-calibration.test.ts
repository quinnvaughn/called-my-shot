import { describe, expect, it } from "vitest"
import {
	absoluteBand,
	BAND_TUNING,
	bandFor,
	bandTemplates,
	hitRate,
	nextBand,
	type ScoreSample,
	samplesFrom,
} from "./band-calibration"

const DAY = 24 * 60 * 60 * 1000
const START = new Date("2026-01-01T00:00:00Z").getTime()

// A score `miss` away from a reference guess of 100.
const off = (miss: number): ScoreSample => ({
	actual: 100 + miss,
	reference: 100,
})

const repeat = (count: number, miss: number) =>
	Array.from({ length: count }, () => off(miss))

function game(
	day: number,
	homeScore: number | null,
	awayScore: number | null,
	seasonId = "s1",
) {
	return {
		seasonId,
		homeTeamId: "home",
		awayTeamId: "away",
		homeScore,
		awayScore,
		startsAt: new Date(START + day * DAY),
	}
}

describe("bandTemplates", () => {
	it("covers every generated team numeric guess", () => {
		expect(bandTemplates()).toEqual(
			expect.arrayContaining([
				{ leagueSlug: "nba", templateId: "team-points", statName: "Points" },
				{ leagueSlug: "nfl", templateId: "team-points", statName: "Points" },
				{ leagueSlug: "mlb", templateId: "team-runs", statName: "Runs" },
			]),
		)
	})
})

describe("samplesFrom", () => {
	it("waits for enough earlier games and rounds the average", () => {
		const games = [
			game(0, 100, 90),
			game(1, 101, 90),
			game(2, 101, 90),
			game(3, 120, 95),
		]
		// Only the fourth game has three earlier ones: home averaged 100.67.
		expect(samplesFrom(games)).toEqual([
			{ actual: 95, reference: 90 },
			{ actual: 120, reference: 101 },
		])
	})

	it("averages each season on its own", () => {
		const games = [
			game(0, 100, 100, "old"),
			game(1, 100, 100, "old"),
			game(2, 100, 100, "old"),
			game(3, 50, 50, "new"),
		]
		expect(samplesFrom(games)).toEqual([])
	})

	it("reads games in start order and returns the most recent first", () => {
		const games = [
			game(4, 130, 70),
			game(0, 100, 80),
			game(1, 100, 80),
			game(2, 100, 80),
			game(3, 110, 90),
		]
		expect(samplesFrom(games)).toEqual([
			{ actual: 70, reference: 83 },
			{ actual: 130, reference: 103 },
			{ actual: 90, reference: 80 },
			{ actual: 110, reference: 100 },
		])
	})

	it("skips a final game with no score", () => {
		const games = [
			game(0, 100, 100),
			game(1, null, null),
			game(2, 100, 100),
			game(3, 100, 100),
		]
		expect(samplesFrom(games)).toEqual([])
	})
})

describe("hitRate", () => {
	it("scores the reference guess the same way a real guess is", () => {
		const samples = [off(0), off(3), off(6), off(9)]
		expect(hitRate(samples, { mode: "absolute", amount: 3 })).toBe(0.5)
		// A 10% band on 106 is floor(10.6) = 10.
		expect(hitRate(samples, { mode: "percentage", pct: 0.1 })).toBe(1)
		expect(hitRate([], { mode: "absolute", amount: 3 })).toBeNull()
	})
})

describe("bandFor", () => {
	it("is the narrowest band that hits the target share", () => {
		expect(bandFor([off(2), off(4), off(6)], 1 / 3)).toBe(2)
		expect(bandFor([off(2), off(4), off(6)], 0.5)).toBe(4)
	})

	it("doesn't overshoot on float noise in the target", () => {
		const samples = Array.from({ length: 300 }, (_, i) => off(i))
		// 0.5 / 1.5 is a third with float noise in it.
		expect(bandFor(samples, 0.5 / 1.5)).toBe(99)
	})

	it("never goes under the smallest band", () => {
		expect(bandFor(repeat(10, 0))).toBe(BAND_TUNING.minBand)
		expect(bandFor([])).toBeNull()
	})
})

describe("nextBand", () => {
	it("waits for enough scores", () => {
		expect(nextBand(10, repeat(BAND_TUNING.minSample - 1, 3))).toBeNull()
	})

	it("moves toward the suggested band by at most a step per run", () => {
		// A step is 20% of the band, and never less than 1.
		expect(nextBand(10, repeat(BAND_TUNING.minSample, 3))).toBe(8)
		expect(nextBand(3, repeat(BAND_TUNING.minSample, 10))).toBe(4)
		expect(nextBand(5, repeat(BAND_TUNING.minSample, 4))).toBe(4)
	})

	it("leaves a band already where the scores point", () => {
		expect(nextBand(3, repeat(BAND_TUNING.minSample, 3))).toBeNull()
	})
})

describe("absoluteBand", () => {
	it("passes an absolute band through", () => {
		expect(absoluteBand({ mode: "absolute", amount: 6 }, [])).toBe(6)
	})

	it("reads a percentage band off a typical score", () => {
		const samples = [3, 4, 4, 5, 9].map((actual) => ({ actual, reference: 4 }))
		// floor(4 x 0.15) is 0, and a band is never under 1.
		expect(absoluteBand({ mode: "percentage", pct: 0.15 }, samples)).toBe(1)
		expect(absoluteBand({ mode: "percentage", pct: 0.15 }, [])).toBeNull()
	})
})

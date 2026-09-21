import { describe, expect, it } from "vitest"
import {
	bestRecord,
	recordsFrom,
	TITLE_TUNING,
	titleGroups,
	titleRates,
} from "./title-calibration"

const game = (
	home: string,
	away: string,
	homeScore: number,
	awayScore: number,
) => ({
	homeTeamId: home,
	awayTeamId: away,
	homeScore,
	awayScore,
})

describe("titleGroups", () => {
	it("covers each league's single-pick titles once per award name", () => {
		const groups = titleGroups()
		expect(groups).toEqual(
			expect.arrayContaining([
				{ leagueSlug: "nba", awardName: "NBA Finals" },
				{ leagueSlug: "nba", awardName: "Conference Finals" },
				{ leagueSlug: "mlb", awardName: "Pennant" },
			]),
		)
		expect(
			groups.filter((g) => g.leagueSlug === "mlb" && g.awardName === "Pennant"),
		).toHaveLength(1)
	})
})

describe("recordsFrom", () => {
	it("counts wins and games, a tie as half a win", () => {
		const records = recordsFrom([
			game("a", "b", 3, 1),
			game("b", "a", 2, 2),
			game("a", "c", 0, 5),
			{ homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null },
		])
		expect(records.get("a")).toEqual({ wins: 1.5, games: 3 })
		expect(records.get("b")).toEqual({ wins: 0.5, games: 2 })
		expect(records.get("c")).toEqual({ wins: 1, games: 1 })
	})
})

describe("bestRecord", () => {
	const records = recordsFrom([
		game("a", "b", 3, 1),
		game("c", "d", 3, 1),
		game("b", "d", 3, 1),
	])

	it("takes the best share of wins among the pool", () => {
		expect(bestRecord(["b", "d"], records)).toBe("b")
	})

	it("keeps the first listed on a tie and skips teams that didn't play", () => {
		expect(bestRecord(["x", "c", "a"], records)).toBe("c")
		expect(bestRecord(["x"], records)).toBeNull()
	})
})

describe("title rates", () => {
	const results = (count: number, every: number) =>
		Array.from({ length: count }, (_, i) => i % every === 0)

	it("leans a league title's record on the pool", () => {
		expect(titleRates.blended(results(20, 4), { hits: 5, total: 20 })).toBe(
			0.25,
		)
		expect(titleRates.blended([], { hits: 5, total: 20 })).toBe(0.25)
	})

	it("breaks a pick on the best record even and steps toward it", () => {
		expect(titleRates.suggested(0.25)).toBe(0.33)
		expect(titleRates.next(0.3, 0.25, TITLE_TUNING.minSample)).toBe(0.33)
		expect(titleRates.next(0.3, 0.5, TITLE_TUNING.minSample)).toBe(0.4)
		expect(titleRates.next(0.3, 0.25, TITLE_TUNING.minSample - 1)).toBeNull()
	})
})

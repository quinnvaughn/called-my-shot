import { describe, expect, it } from "vitest"
import {
	LEADER_TUNING,
	leaderRates,
	leaderTemplates,
} from "./leader-calibration"

// `count` resolved leader questions, the favorite leading one in `every`.
const results = (count: number, every: number) =>
	Array.from({ length: count }, (_, i) => i % every === 0)

describe("leaderTemplates", () => {
	it("covers every generated game stat leader", () => {
		expect(leaderTemplates()).toEqual(
			expect.arrayContaining([
				{ leagueSlug: "nba", templateId: "points-leader", statName: "Points" },
				{ leagueSlug: "nfl", templateId: "sacks-leader", statName: "Sacks" },
				{ leagueSlug: "mlb", templateId: "hits-leader", statName: "Hits" },
			]),
		)
	})
})

describe("leaderRates.blended", () => {
	it("starts a league stat with no record at everyone else's", () => {
		expect(leaderRates.blended([], { hits: 10, total: 40 })).toBe(0.25)
	})

	it("is a league stat's own record when it's the only one", () => {
		expect(leaderRates.blended(results(40, 4), { hits: 10, total: 40 })).toBe(
			0.25,
		)
	})
})

describe("leaderRates.suggested", () => {
	it("is where a pick on the favorite breaks even, within bounds", () => {
		expect(leaderRates.suggested(0.25)).toBe(0.33)
		expect(leaderRates.suggested(0.5)).toBe(LEADER_TUNING.maxRate)
		expect(leaderRates.suggested(0)).toBe(LEADER_TUNING.minRate)
		expect(leaderRates.suggested(null)).toBeNull()
	})
})

describe("leaderRates.next", () => {
	it("waits for enough resolved questions anywhere", () => {
		expect(leaderRates.next(0.25, 0.5, LEADER_TUNING.minSample - 1)).toBeNull()
	})

	it("moves toward the suggested rate by at most a step per run", () => {
		expect(leaderRates.next(0.25, 0.25, 40)).toBe(0.33)
		expect(leaderRates.next(0.25, 0.5, 40)).toBe(0.35)
		expect(leaderRates.next(0.5, 0.1, 40)).toBe(0.4)
	})

	it("leaves a rate already where the record points", () => {
		expect(leaderRates.next(0.33, 0.25, 40)).toBeNull()
	})
})

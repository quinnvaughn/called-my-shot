import { describe, expect, it } from "vitest"
import {
	favoriteHitRate,
	LEADER_TUNING,
	leaderTemplates,
	nextLossRate,
	suggestedLossRate,
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
				{
					leagueSlug: "mlb",
					templateId: "hits-leader",
					statName: "Hits",
				},
			]),
		)
	})
})

describe("favoriteHitRate", () => {
	it("is the share the favorite led", () => {
		expect(favoriteHitRate(results(40, 4))).toBe(0.25)
		expect(favoriteHitRate([])).toBeNull()
	})
})

describe("suggestedLossRate", () => {
	it("is where a pick on the favorite breaks even", () => {
		expect(suggestedLossRate(results(40, 4))).toBe(0.33)
		expect(suggestedLossRate(results(40, 2))).toBe(1)
	})

	it("stays within the rate bounds", () => {
		expect(suggestedLossRate(results(40, 41).map(() => false))).toBe(
			LEADER_TUNING.minRate,
		)
		expect(suggestedLossRate(results(40, 1))).toBe(LEADER_TUNING.maxRate)
		expect(suggestedLossRate([])).toBeNull()
	})
})

describe("nextLossRate", () => {
	it("waits for enough resolved questions", () => {
		expect(
			nextLossRate(0.25, results(LEADER_TUNING.minSample - 1, 2)),
		).toBeNull()
	})

	it("moves toward the suggested rate by at most a step per run", () => {
		expect(nextLossRate(0.25, results(40, 4))).toBe(0.33)
		expect(nextLossRate(0.25, results(40, 2))).toBe(0.35)
		expect(nextLossRate(0.5, results(40, 10))).toBe(0.4)
	})

	it("leaves a rate already where the results point", () => {
		expect(nextLossRate(0.33, results(40, 4))).toBeNull()
	})
})

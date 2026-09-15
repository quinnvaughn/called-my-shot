import { describe, expect, it } from "vitest"
import {
	blendedHitRate,
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
				{ leagueSlug: "mlb", templateId: "hits-leader", statName: "Hits" },
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

describe("blendedHitRate", () => {
	it("starts a league stat with no record at everyone else's", () => {
		expect(blendedHitRate([], { hits: 10, total: 40 })).toBe(0.25)
	})

	it("is a league stat's own record when it's the only one", () => {
		expect(blendedHitRate(results(40, 4), { hits: 10, total: 40 })).toBe(0.25)
	})
})

describe("suggestedLossRate", () => {
	it("is where a pick on the favorite breaks even, within bounds", () => {
		expect(suggestedLossRate(0.25)).toBe(0.33)
		expect(suggestedLossRate(0.5)).toBe(LEADER_TUNING.maxRate)
		expect(suggestedLossRate(0)).toBe(LEADER_TUNING.minRate)
		expect(suggestedLossRate(null)).toBeNull()
	})
})

describe("nextLossRate", () => {
	it("waits for enough resolved questions anywhere", () => {
		expect(nextLossRate(0.25, 0.5, LEADER_TUNING.minSample - 1)).toBeNull()
	})

	it("moves toward the suggested rate by at most a step per run", () => {
		expect(nextLossRate(0.25, 0.25, 40)).toBe(0.33)
		expect(nextLossRate(0.25, 0.5, 40)).toBe(0.35)
		expect(nextLossRate(0.5, 0.1, 40)).toBe(0.4)
	})

	it("leaves a rate already where the record points", () => {
		expect(nextLossRate(0.33, 0.25, 40)).toBeNull()
	})
})

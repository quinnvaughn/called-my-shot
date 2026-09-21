import { describe, expect, it } from "vitest"
import { leagueScope } from "./group-leaderboard"

describe("leagueScope", () => {
	it("narrows to a tab's league when the group tracks it", () => {
		expect(leagueScope(["nba", "nfl"], "nba")).toEqual(["nba"])
	})

	it("narrows to any league for a group that tracks every league", () => {
		expect(leagueScope(null, "nba")).toEqual(["nba"])
	})

	it("falls back to the tracked set for a league the group doesn't track", () => {
		expect(leagueScope(["nba"], "nfl")).toEqual(["nba"])
	})

	it("uses the tracked set with no tab", () => {
		expect(leagueScope(["nba"], null)).toEqual(["nba"])
		expect(leagueScope(null, null)).toBeNull()
	})
})

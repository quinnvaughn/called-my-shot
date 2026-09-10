import { describe, expect, it } from "vitest"
import { type FilterLeague, resolveLeaderboardFilter } from "./leaderboard-filter"

function league(slug: string, abbreviation: string): FilterLeague {
	return {
		id: `${slug}-id`,
		name: abbreviation,
		abbreviation,
		slug,
		currentSeason: { id: `${slug}-2026`, year: 2026, displayName: "2026-27" },
		seasons: [{ id: `${slug}-2025`, year: 2025, displayName: "2025-26" }],
	}
}

const nba = league("nba", "NBA")
const nfl = league("nfl", "NFL")

describe("resolveLeaderboardFilter", () => {
	it("defaults to the only league when there's just one", () => {
		const filter = resolveLeaderboardFilter([nba], {})

		expect(filter.leagueId).toBe(nba.id)
		expect(filter.seasonValue).toBe("2026")
	})

	it("resolves a season year under that single-league default", () => {
		const filter = resolveLeaderboardFilter([nba], { season: "2025" })

		expect(filter.season).toEqual({ scope: "SPECIFIC", seasonId: "nba-2025" })
	})

	it("defaults to All when there are several leagues", () => {
		expect(resolveLeaderboardFilter([nba, nfl], {}).leagueId).toBeNull()
	})

	it("names the ranked set on the All board", () => {
		expect(resolveLeaderboardFilter([nba, nfl], {}).scopeLabel).toBe(
			"Current season, every league",
		)
		expect(
			resolveLeaderboardFilter(
				[nba, nfl],
				{},
				{ allLeaguesLabel: "NBA and NFL" },
			).scopeLabel,
		).toBe("Current season, NBA and NFL")
	})
})

import { describe, expect, it } from "vitest"
import { EMPTY_FILTERS } from "#/components/filters/question-filter-bar"
import {
	filtersFromSearch,
	filtersToSearch,
	myCallsDirection,
	myCallsSort,
	validateMyCallsSearch,
} from "./my-calls-search"

const leagues = [
	{ id: "league-nba", slug: "nba" },
	{ id: "league-nfl", slug: "nfl" },
]

describe("validateMyCallsSearch", () => {
	it("leaves the bare URL as all defaults", () => {
		const search = validateMyCallsSearch({})
		expect(filtersFromSearch(search, leagues)).toEqual(EMPTY_FILTERS)
		expect(myCallsSort(search)).toBe("DATE")
		expect(myCallsDirection(search)).toBe("DESC")
	})

	it("drops values it doesn't recognize", () => {
		expect(
			validateMyCallsSearch({
				tab: "archived",
				scope: "WEEK",
				result: "PUSH",
				dir: "sideways",
				shapes: "NOT_A_SHAPE",
				q: "",
			}),
		).toEqual({})
	})

	// Points only exists on the Resolved tab, so a link carrying it onto Open
	// falls back to Open's default.
	it("only accepts a sort the tab offers", () => {
		expect(validateMyCallsSearch({ sort: "POINTS" }).sort).toBeUndefined()
		expect(
			validateMyCallsSearch({ tab: "resolved", sort: "POINTS" }).sort,
		).toBe("POINTS")
	})

	it("defaults the resolved tab to its own sort", () => {
		expect(myCallsSort(validateMyCallsSearch({ tab: "resolved" }))).toBe(
			"POINTS",
		)
	})
})

describe("filters round-trip through the URL", () => {
	it("restores every filter it wrote", () => {
		const filters = {
			search: "lebron ",
			leagueId: "league-nba",
			shapes: [
				"GAME_TOTAL_OVER_UNDER" as const,
				"PLAYER_SEASON_AWARD" as const,
			],
			scope: "GAME" as const,
			result: "HIT" as const,
		}
		const search = validateMyCallsSearch(filtersToSearch(filters, leagues))
		expect(search.league).toBe("nba")
		expect(filtersFromSearch(search, leagues)).toEqual(filters)
	})

	it("writes nothing for an untouched filter bar", () => {
		expect(
			Object.values(filtersToSearch(EMPTY_FILTERS, leagues)).every(
				(v) => v === undefined,
			),
		).toBe(true)
	})

	it("treats an unknown league slug as all leagues", () => {
		expect(filtersFromSearch({ league: "xfl" }, leagues).leagueId).toBeNull()
	})
})

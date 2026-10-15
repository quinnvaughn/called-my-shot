import { describe, expect, it } from "vitest"
import { EMPTY_FILTERS } from "#/components/filters/question-filter-bar"
import {
	filtersFromSearch,
	filtersToSearch,
	myCallsDirection,
	myCallsKind,
	myCallsSearchSchema,
	myCallsSort,
} from "./my-calls-search"

const leagues = [
	{ id: "league-nba", slug: "nba" },
	{ id: "league-nfl", slug: "nfl" },
]

describe("myCallsSearchSchema", () => {
	it("leaves the bare URL as all defaults", () => {
		const search = myCallsSearchSchema.parse({})
		expect(filtersFromSearch(search, leagues)).toEqual(EMPTY_FILTERS)
		expect(myCallsKind(search)).toBe("game")
		expect(myCallsSort(search)).toBe("DATE")
		expect(myCallsDirection(search)).toBe("DESC")
	})

	it("drops values it doesn't recognize", () => {
		expect(
			myCallsSearchSchema.parse({
				kind: "playoffs",
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
		expect(myCallsSearchSchema.parse({ sort: "POINTS" }).sort).toBeUndefined()
		expect(
			myCallsSearchSchema.parse({ tab: "resolved", sort: "POINTS" }).sort,
		).toBe("POINTS")
	})

	it("defaults the resolved tab to its own sort", () => {
		expect(myCallsSort(myCallsSearchSchema.parse({ tab: "resolved" }))).toBe(
			"POINTS",
		)
	})
})

describe("shapes on each side", () => {
	it("drops a picked shape the side can't hold", () => {
		expect(
			myCallsSearchSchema.parse({
				kind: "season",
				shapes: "PLAYER_STAT_OVER_UNDER,PLAYER_SEASON_AWARD,YES_NO_PROP",
			}).shapes,
		).toBe("PLAYER_SEASON_AWARD,YES_NO_PROP")
		expect(
			myCallsSearchSchema.parse({
				shapes: "PLAYER_STAT_OVER_UNDER,PLAYER_SEASON_AWARD,YES_NO_PROP",
			}).shapes,
		).toBe("PLAYER_STAT_OVER_UNDER,YES_NO_PROP")
	})

	it("clears the param when nothing picked fits", () => {
		expect(
			myCallsSearchSchema.parse({
				kind: "season",
				shapes: "GAME_TOTAL_OVER_UNDER",
			}).shapes,
		).toBeUndefined()
	})
})

describe("filters round-trip through the URL", () => {
	it("restores every filter it wrote", () => {
		const filters = {
			search: "lebron ",
			leagueId: "league-nba",
			shapes: ["GAME_TOTAL_OVER_UNDER" as const, "YES_NO_PROP" as const],
			scope: null,
			result: "HIT" as const,
		}
		const search = myCallsSearchSchema.parse(filtersToSearch(filters, leagues))
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

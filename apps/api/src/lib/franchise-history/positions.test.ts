import { describe, expect, it } from "vitest"
import { leaguePositions, nbaWikidataPositions } from "./positions"

describe("leaguePositions", () => {
	it("maps each source's names onto the league's codes", () => {
		expect(leaguePositions("nfl", "OLB")).toEqual(["LB"])
		expect(leaguePositions("nfl", "FS")).toEqual(["DB"])
		expect(leaguePositions("nfl", "C")).toEqual(["OL"])
		expect(leaguePositions("mlb", "LF")).toEqual(["OF"])
		expect(leaguePositions("mlb", "RP")).toEqual(["P"])
		expect(leaguePositions("nhl", "L")).toEqual(["LW"])
		expect(leaguePositions("nhl", "C")).toEqual(["C"])
	})

	it("counts a coarse or hybrid NBA position as every one it covers", () => {
		expect(leaguePositions("nba", "G")).toEqual(["PG", "SG"])
		expect(leaguePositions("nba", "G-F")).toEqual(["PG", "SG", "SF", "PF"])
		expect(leaguePositions("nba", "F-C")).toEqual(["SF", "PF", "C"])
	})

	it("gives nothing for a missing or unknown position", () => {
		expect(leaguePositions("mlb", null)).toEqual([])
		expect(leaguePositions("mlb", "PH")).toEqual([])
	})
})

describe("nbaWikidataPositions", () => {
	it("reads Wikidata's position names, hybrids as both", () => {
		expect(nbaWikidataPositions(["point guard"])).toEqual(["PG"])
		expect(nbaWikidataPositions(["Power forward", "center"])).toEqual([
			"PF",
			"C",
		])
		expect(nbaWikidataPositions(["swingman"])).toEqual(["SG", "SF"])
		expect(nbaWikidataPositions(["basketball coach"])).toEqual([])
	})
})

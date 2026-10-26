import { describe, expect, it } from "vitest"
import { redraftTags, rushmoreTags } from "./tags"

describe("rushmoreTags", () => {
	it("tags a franchise Rushmore with its team and league, and each pick as a mention", () => {
		const tags = rushmoreTags({ leagueId: "nba", teamId: "celtics" }, [
			"bird",
			"russell",
		])
		expect(tags).toEqual([
			{ spaceKind: "team", spaceId: "celtics", role: "subject" },
			{ spaceKind: "league", spaceId: "nba", role: "subject" },
			{ spaceKind: "player", spaceId: "bird", role: "mention" },
			{ spaceKind: "player", spaceId: "russell", role: "mention" },
		])
	})

	it("tags a league prompt's answer with the league alone", () => {
		const tags = rushmoreTags({ leagueId: "nba", teamId: null }, ["magic"])
		expect(tags.filter((tag) => tag.role === "subject")).toEqual([
			{ spaceKind: "league", spaceId: "nba", role: "subject" },
		])
	})

	it("mentions each league an any-sport prompt's picks played in", () => {
		const tags = rushmoreTags(
			{ leagueId: null, teamId: null },
			["russell", "brady"],
			["nba", "nfl", "nba"],
		)
		expect(tags.filter((tag) => tag.spaceKind === "league")).toEqual([
			{ spaceKind: "league", spaceId: "nba", role: "mention" },
			{ spaceKind: "league", spaceId: "nfl", role: "mention" },
		])
		expect(tags.filter((tag) => tag.role === "subject")).toEqual([])
	})

	it("never pulls in a mention's other teams", () => {
		const tags = rushmoreTags({ leagueId: "nba", teamId: "celtics" }, [
			"garnett",
		])
		expect(tags.filter((tag) => tag.spaceKind === "team")).toEqual([
			{ spaceKind: "team", spaceId: "celtics", role: "subject" },
		])
	})
})

describe("redraftTags", () => {
	it("tags a redraft with its league and each pick as a mention, never a team", () => {
		expect(
			redraftTags({ leagueId: "nba" }, ["lebron", "wade", "lebron"]),
		).toEqual([
			{ spaceKind: "league", spaceId: "nba", role: "subject" },
			{ spaceKind: "player", spaceId: "lebron", role: "mention" },
			{ spaceKind: "player", spaceId: "wade", role: "mention" },
		])
	})
})

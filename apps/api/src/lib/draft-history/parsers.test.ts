import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { type MlbDraftJson, parseMlbDraft } from "./mlb"
import { brefDraftUrl, parseBrefDraft } from "./nba"
import { nflTeamName, parseNflDraft } from "./nfl"
import { type NhlDraftRow, type NhlTeamRow, parseNhlDraft } from "./nhl"

const fixture = (name: string) =>
	readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")

describe("parseBrefDraft", () => {
	it("reads each pick's round, team franchise, name at the time and bref id", () => {
		const picks = parseBrefDraft(fixture("bref-draft-2003.html"), 2003)
		expect(picks.slice(0, 2)).toEqual([
			{
				year: 2003,
				round: 1,
				overall: 1,
				teamAbbreviation: "CLE",
				teamName: "Cleveland Cavaliers",
				sourceId: "jamesle01",
				name: "LeBron James",
			},
			expect.objectContaining({
				overall: 2,
				teamName: "Detroit Pistons",
				name: "Darko Miličić",
			}),
		])
		expect(picks.at(-1)).toMatchObject({ round: 2 })
	})

	it("asks for the BAA's drafts by their own name", () => {
		expect(brefDraftUrl(1947)).toMatch(/BAA_1947\.html$/)
		expect(brefDraftUrl(2003)).toMatch(/NBA_2003\.html$/)
	})
})

describe("parseNhlDraft", () => {
	const json = JSON.parse(fixture("nhl-draft.json")) as { data: NhlDraftRow[] }
	const teams = JSON.parse(fixture("nhl-teams.json")) as { data: NhlTeamRow[] }
	const picks = parseNhlDraft(json.data, teams.data)

	it("maps the drafting team to its franchise and its name then", () => {
		expect(
			picks.find((pick) => pick.overall === 1 && pick.year === 2003),
		).toEqual({
			year: 2003,
			round: 1,
			overall: 1,
			teamAbbreviation: "PIT",
			teamName: "Pittsburgh Penguins",
			sourceId: "8470594",
			name: "Marc-Andre Fleury",
		})
	})

	it("drops voided picks and sends the original Jets to no franchise", () => {
		expect(picks.some((pick) => pick.name === "INVALID")).toBe(false)
		expect(picks.find((pick) => pick.year === 1979)).toMatchObject({
			teamAbbreviation: null,
			teamName: "Winnipeg Jets",
		})
	})
})

describe("parseMlbDraft", () => {
	const json = JSON.parse(fixture("mlb-draft-2003.json")) as MlbDraftJson
	const picks = parseMlbDraft(json, new Map([[139, "Tampa Bay Devil Rays"]]))

	it("keeps the first round and later picks who reached the majors, with that season's team names", () => {
		expect(picks.map((pick) => [pick.overall, pick.round, pick.name])).toEqual([
			[1, 1, "Delmon Young"],
			[2, 1, "Rickie Weeks Jr."],
			[368, 13, "Chad Orvella"],
		])
		expect(picks[0]).toMatchObject({
			teamAbbreviation: "TB",
			teamName: "Tampa Bay Devil Rays",
			sourceId: "430321",
		})
	})
})

describe("parseNflDraft", () => {
	const picks = parseNflDraft(fixture("nfl-draft-picks.csv"))

	it("maps codes to today's franchise with the name the team had that year", () => {
		expect(picks.find((pick) => pick.year === 1983)).toMatchObject({
			overall: 1,
			teamAbbreviation: "IND",
			teamName: "Baltimore Colts",
			name: "John Elway",
		})
		expect(picks.find((pick) => pick.overall === 199)).toMatchObject({
			round: 6,
			teamAbbreviation: "NE",
			teamName: null,
			sourceId: "00-0019596",
		})
	})

	it("leaves the id out when the table has none", () => {
		expect(
			picks.find((pick) => pick.name === "Mike Heaven")?.sourceId,
		).toBeNull()
	})

	it("names a franchise by its era", () => {
		expect(nflTeamName("HOU", 1990)).toBe("Houston Oilers")
		expect(nflTeamName("HOU", 2010)).toBe("Houston Texans")
		expect(nflTeamName("GNB", 1990)).toBeNull()
	})
})

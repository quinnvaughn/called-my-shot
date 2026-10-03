import { describe, expect, it } from "vitest"
import { buildNameIndex, findByName } from "./name-match"

const index = buildNameIndex([
	{ team: "Montréal Canadiens", name: "Samuel Montembeault", value: 1 },
	{ team: "Atlanta Braves", name: "Ronald Acuña Jr.", value: 2 },
	{ team: "Seattle Mariners", name: "Luis Garcia", value: 3 },
	{ team: "Houston Astros", name: "Luis Garcia", value: 4 },
	{ team: "Vancouver Canucks", name: "Elias Pettersson", value: 5 },
	{ team: "Vancouver Canucks", name: "Elias Nils Pettersson", value: 6 },
	{ team: "Milwaukee Bucks", name: "Bobby Portis", value: 7 },
])

describe("findByName", () => {
	it("folds diacritics and punctuation in player and team names", () => {
		expect(findByName(index, "Ronald Acuna Jr", "Atlanta Braves")).toBe(2)
		expect(findByName(index, "Samuel Montembeault", "Montreal Canadiens")).toBe(
			1,
		)
	})

	it("prefers the player's own team for a shared name", () => {
		expect(findByName(index, "Luis Garcia", "Houston Astros")).toBe(4)
	})

	it("refuses a shared name off the player's team rather than guessing", () => {
		expect(findByName(index, "Luis Garcia", "New York Mets")).toBeNull()
	})

	it("finds a traded player league-wide by a name only he holds", () => {
		expect(findByName(index, "Ronald Acuna Jr.", "San Diego Padres")).toBe(2)
	})

	it("matches a nickname to a given name on the same team", () => {
		expect(findByName(index, "Sam Montembeault", "Montreal Canadiens")).toBe(1)
		expect(findByName(index, "Bobby Portis Jr.", "Milwaukee Bucks")).toBe(7)
	})

	it("doesn't match a nickname off the player's own team", () => {
		expect(findByName(index, "Sam Montembeault", "Boston Bruins")).toBeNull()
	})

	it("doesn't match a nickname two teammates could both be", () => {
		expect(
			findByName(index, "Elias N. Pettersson", "Vancouver Canucks"),
		).toBeNull()
	})
})

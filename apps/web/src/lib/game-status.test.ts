import { describe, expect, it } from "vitest"
import { formatRecord, seriesLead } from "./game-status"

describe("formatRecord", () => {
	it("joins wins and losses with an en dash", () => {
		expect(formatRecord(10, 6)).toBe("10–6")
		expect(formatRecord(0, 0)).toBe("0–0")
	})

	it("writes a third count whenever one is given, zero included", () => {
		expect(formatRecord(10, 6, 1)).toBe("10–6–1")
		expect(formatRecord(1, 0, 0)).toBe("1–0–0")
	})

	it("leaves the third count off when there isn't one", () => {
		expect(formatRecord(10, 6, null)).toBe("10–6")
		expect(formatRecord(10, 6, undefined)).toBe("10–6")
	})
})

describe("seriesLead", () => {
	const postseason = {
		gameNumber: 5,
		ifNecessary: false,
		summary: "Series tied 2-2",
		clinchTeamIds: ["a", "b"],
	}

	it("leads with the stakes on a game still to be played", () => {
		expect(seriesLead({ status: "SCHEDULED", postseason })).toBe(
			"Game 5, winner take all. Series tied 2-2.",
		)
	})

	it("drops the stakes once the game is final", () => {
		expect(seriesLead({ status: "FINAL", postseason })).toBe(
			"Game 5. Series tied 2-2.",
		)
	})

	it("marks an if-necessary game instead of its stakes", () => {
		expect(
			seriesLead({
				status: "SCHEDULED",
				postseason: { ...postseason, ifNecessary: true, summary: null },
			}),
		).toBe("Game 5, if necessary.")
	})

	it("is null outside a series", () => {
		expect(seriesLead({ status: "SCHEDULED", postseason: null })).toBeNull()
		expect(
			seriesLead({
				status: "SCHEDULED",
				postseason: { ...postseason, gameNumber: null },
			}),
		).toBeNull()
	})
})

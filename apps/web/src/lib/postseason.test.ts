import { describe, expect, it } from "vitest"
import {
	eliminationGamesLabel,
	postseasonDescription,
	roundsPhrase,
	windowStakesLine,
} from "./postseason"

describe("roundsPhrase", () => {
	it("collapses an AL/NL pair of the same round", () => {
		expect(roundsPhrase(["NL Wild Card Series", "AL Wild Card Series"])).toBe(
			"Wild Card Series",
		)
	})

	it("joins two different rounds", () => {
		expect(roundsPhrase(["ALDS", "NLDS"])).toBe("ALDS & NLDS")
	})

	it("lists three or more rounds", () => {
		expect(roundsPhrase(["ALWC", "NLDS", "ALDS"])).toBe("ALWC, NLDS, ALDS")
	})

	it("passes a single round through", () => {
		expect(roundsPhrase(["First Round"])).toBe("First Round")
	})

	it("is null with no rounds", () => {
		expect(roundsPhrase([])).toBeNull()
	})
})

describe("eliminationGamesLabel", () => {
	it("pluralizes", () => {
		expect(eliminationGamesLabel(1)).toBe("1 elimination game")
		expect(eliminationGamesLabel(3)).toBe("3 elimination games")
	})
})

describe("postseasonDescription", () => {
	it("names the rounds when there are series", () => {
		expect(postseasonDescription("MLB", ["ALDS", "NLDS"])).toBe(
			"MLB ALDS & NLDS on the board. Call series winners, game winners and player lines.",
		)
	})

	it("leaves series out for a postseason of single games", () => {
		expect(postseasonDescription("NFL", [])).toBe(
			"The NFL postseason is on the board. Call game winners, totals and player lines.",
		)
	})
})

describe("windowStakesLine", () => {
	const game = (
		status: string,
		clinchTeamIds: string[],
		ifNecessary = false,
	) => ({ status, postseason: { ifNecessary, clinchTeamIds } })

	it("counts elimination and winner-take-all games across groups", () => {
		expect(
			windowStakesLine([
				{ games: [game("SCHEDULED", ["a"]), game("LIVE", ["a", "b"])] },
				{ games: [game("SCHEDULED", ["c"])] },
			]),
		).toBe("3 elimination games · 1 winner take all")
	})

	it("leaves out the winner-take-all count when there are none", () => {
		expect(windowStakesLine([{ games: [game("SCHEDULED", ["a"])] }])).toBe(
			"1 elimination game",
		)
	})

	it("skips final, if-necessary and non-deciding games", () => {
		expect(
			windowStakesLine([
				{
					games: [
						game("FINAL", ["a"]),
						game("SCHEDULED", ["a"], true),
						game("SCHEDULED", []),
						{ status: "SCHEDULED", postseason: null },
					],
				},
			]),
		).toBeNull()
	})

	it("is null with no games", () => {
		expect(windowStakesLine([])).toBeNull()
	})
})

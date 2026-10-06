import { describe, expect, it } from "vitest"
import { type WinTotalBudget, winTotalTrackerLine } from "./win-total-tracker"

const nfl = (
	otherPicksSum: number,
	otherPicksCount: number,
): WinTotalBudget => ({
	leagueAbbreviation: "NFL",
	gamesPerSeason: 17,
	teamCount: 32,
	otherPicksSum,
	otherPicksCount,
})

describe("winTotalTrackerLine", () => {
	it("splits what's left across the teams still to pick", () => {
		expect(winTotalTrackerLine(nfl(230, 28), 11)).toEqual({
			text: "With this pick, 241 of 272 NFL wins are handed out. 31 wins left for the 3 teams still to pick, about 10.3 each.",
			off: false,
		})
	})

	it("reads the first pick against the whole league", () => {
		expect(winTotalTrackerLine(nfl(0, 0), 9).text).toBe(
			"With this pick, 9 of 272 NFL wins are handed out. 263 wins left for the 31 teams still to pick, about 8.5 each.",
		)
	})

	it("flags a total already past the schedule with teams left", () => {
		expect(winTotalTrackerLine(nfl(265, 29), 10)).toEqual({
			text: "That's 275 wins handed out with 2 teams still to pick, already 3 more than the 272 the schedule has.",
			off: true,
		})
	})

	it("confirms a last pick that lands exactly on the schedule", () => {
		expect(winTotalTrackerLine(nfl(263, 31), 9)).toEqual({
			text: "That makes all 272 NFL wins, exactly what the schedule hands out.",
			off: false,
		})
	})

	it("says how far a finished ballot is off", () => {
		expect(winTotalTrackerLine(nfl(275, 31), 9)).toEqual({
			text: "That makes 284 wins across all 32 teams. The schedule hands out exactly 272, so you'd be 12 wins over.",
			off: true,
		})
		expect(winTotalTrackerLine(nfl(262, 31), 9).text).toBe(
			"That makes 271 wins across all 32 teams. The schedule hands out exactly 272, so you'd be 1 win under.",
		)
	})
})

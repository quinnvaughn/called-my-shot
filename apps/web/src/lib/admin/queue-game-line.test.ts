import { describe, expect, it } from "vitest"
import { queueGameLine } from "./queue-game-line"

const game = {
	startsAt: "2026-10-14T23:10:00Z",
	status: "SCHEDULED" as const,
	awayScore: null,
	homeScore: null,
	league: { abbreviation: "mlb" },
	awayTeam: { abbreviation: "BOS" },
	homeTeam: { abbreviation: "NYY" },
}

describe("queueGameLine", () => {
	it("is null without a game", () => {
		expect(queueGameLine(null)).toBeNull()
		expect(queueGameLine(undefined)).toBeNull()
	})

	it("names the league, matchup and start time in ET", () => {
		// 23:10 UTC is 7:10 PM in ET.
		expect(queueGameLine(game)).toBe(
			"MLB · BOS @ NYY · Oct 14, 7:10 PM ET · Not started",
		)
	})

	it("carries the final score when both sides have one", () => {
		expect(
			queueGameLine({ ...game, status: "FINAL", awayScore: 3, homeScore: 5 }),
		).toBe("MLB · BOS @ NYY · Oct 14, 7:10 PM ET · Final 3-5")
	})

	it("says only Final when a score is missing", () => {
		expect(queueGameLine({ ...game, status: "FINAL", awayScore: 3 })).toBe(
			"MLB · BOS @ NYY · Oct 14, 7:10 PM ET · Final",
		)
	})

	it("marks a game in progress as live", () => {
		expect(queueGameLine({ ...game, status: "LIVE" })).toBe(
			"MLB · BOS @ NYY · Oct 14, 7:10 PM ET · Live",
		)
	})
})

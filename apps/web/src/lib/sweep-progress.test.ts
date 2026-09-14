import { describe, expect, it } from "vitest"
import { type SweepProgressInput, slateSweepText } from "./sweep-progress"

const game = (away: string, home: string) => ({
	awayTeam: { abbreviation: away },
	homeTeam: { abbreviation: home },
})

const base: SweepProgressInput = {
	status: "ALIVE",
	gameCount: 9,
	calledCount: 4,
	winCount: 0,
	lossCount: 0,
	missedGames: [],
	lostGames: [],
}

describe("slateSweepText", () => {
	it("counts calls while nothing has settled", () => {
		expect(slateSweepText(base)).toBe(
			"4 of 9 winners called. Call all 9 for a sweep.",
		)
	})

	it("states the record once something has settled", () => {
		expect(slateSweepText({ ...base, calledCount: 9, winCount: 3 })).toBe(
			"3–0 so far, 6 to go.",
		)
		expect(slateSweepText({ ...base, calledCount: 7, winCount: 3 })).toBe(
			"3–0 so far, 6 to go. 2 still need your pick.",
		)
		expect(slateSweepText({ ...base, calledCount: 8, winCount: 3 })).toBe(
			"3–0 so far, 6 to go. 1 still needs your pick.",
		)
	})

	it("names the game that was never called", () => {
		expect(
			slateSweepText({
				...base,
				status: "OFF",
				missedGames: [game("BUF", "MIA")],
			}),
		).toBe("Sweep is off. You didn't call BUF @ MIA.")
	})

	it("names at most two games, then counts the rest", () => {
		expect(
			slateSweepText({
				...base,
				status: "OFF",
				missedGames: [game("BUF", "MIA"), game("NYJ", "NE")],
			}),
		).toBe("Sweep is off. You didn't call BUF @ MIA and NYJ @ NE.")
		expect(
			slateSweepText({
				...base,
				status: "OFF",
				missedGames: [
					game("BUF", "MIA"),
					game("NYJ", "NE"),
					game("DAL", "PHI"),
					game("KC", "LV"),
				],
			}),
		).toBe("Sweep is off. You didn't call BUF @ MIA, NYJ @ NE and 2 more.")
	})

	it("names the game that went the other way", () => {
		expect(
			slateSweepText({
				...base,
				status: "OFF",
				lossCount: 1,
				lostGames: [game("BUF", "MIA")],
			}),
		).toBe("Sweep is off. BUF @ MIA went the other way.")
	})

	it("states a finished sweep", () => {
		expect(slateSweepText({ ...base, status: "SWEPT", winCount: 9 })).toBe(
			"Swept. 9 for 9.",
		)
	})
})

import { describe, expect, it } from "vitest"
import {
	currentRounds,
	isEliminationGame,
	type RoundSeries,
	seasonPhase,
} from "./current"
import type { SeriesGame } from "./series"

const season = {
	regularSeasonStartsAt: new Date("2026-03-26T00:00:00Z"),
	regularSeasonEndsAt: new Date("2026-09-28T00:00:00Z"),
	postseasonStartsAt: new Date("2026-09-29T07:00:00Z"),
	postseasonEndsAt: new Date("2026-11-12T08:00:00Z"),
}

describe("seasonPhase", () => {
	it("is upcoming before opening day", () => {
		expect(seasonPhase(season, new Date("2026-03-01T00:00:00Z"))).toBe(
			"upcoming",
		)
	})

	it("counts the gap before the postseason as regular season", () => {
		expect(seasonPhase(season, new Date("2026-09-28T12:00:00Z"))).toBe(
			"regular_season",
		)
	})

	it("is postseason between the postseason's start and end", () => {
		expect(seasonPhase(season, new Date("2026-10-05T00:00:00Z"))).toBe(
			"postseason",
		)
	})

	it("is complete after the postseason ends", () => {
		expect(seasonPhase(season, new Date("2026-11-20T00:00:00Z"))).toBe(
			"complete",
		)
	})

	it("is complete after the regular season for a season with no postseason", () => {
		expect(
			seasonPhase(
				{ ...season, postseasonStartsAt: null, postseasonEndsAt: null },
				new Date("2026-10-05T00:00:00Z"),
			),
		).toBe("complete")
	})
})

function series(
	id: string,
	round: string,
	firstGameAt: string | null,
	decidedAt?: string,
): RoundSeries {
	return {
		id,
		round,
		firstGameAt: firstGameAt ? new Date(firstGameAt) : null,
		winnerTeamId: decidedAt ? "winner" : null,
		decidedAt: decidedAt ? new Date(decidedAt) : null,
	}
}

describe("currentRounds", () => {
	it("lists every round with an undecided series, in first-game order", () => {
		expect(
			currentRounds([
				series("a", "ALWC", "2026-09-29T21:00:00Z"),
				series("b", "NLWC", "2026-09-29T18:00:00Z"),
				series("c", "NLWC", "2026-09-29T22:00:00Z", "2026-10-01T03:00:00Z"),
			]),
		).toEqual(["NLWC", "ALWC"])
	})

	it("drops a finished round once the next one is underway", () => {
		expect(
			currentRounds([
				series("a", "ALWC", "2026-09-29T21:00:00Z", "2026-10-01T03:00:00Z"),
				series("b", "ALDS", "2026-10-04T18:00:00Z"),
			]),
		).toEqual(["ALDS"])
	})

	it("falls back to the rounds decided most recently between rounds", () => {
		expect(
			currentRounds([
				series("a", "ALWC", "2026-09-29T21:00:00Z", "2026-10-01T03:00:00Z"),
				series("b", "NLWC", "2026-09-29T18:00:00Z", "2026-10-02T03:00:00Z"),
				series("c", "First", "2026-09-01T18:00:00Z", "2026-09-10T03:00:00Z"),
			]),
		).toEqual(["NLWC", "ALWC"])
	})

	it("is empty with no series at all", () => {
		expect(currentRounds([])).toEqual([])
	})
})

const HOME = "home-team"
const AWAY = "away-team"

function game(
	number: number,
	winner?: "home" | "away",
	extra: Partial<SeriesGame> = {},
): SeriesGame {
	return {
		id: `g${number}`,
		status: winner ? "final" : "scheduled",
		homeTeamId: HOME,
		awayTeamId: AWAY,
		homeScore: winner ? (winner === "home" ? 5 : 2) : null,
		awayScore: winner ? (winner === "away" ? 5 : 2) : null,
		seriesGameNumber: number,
		ifNecessary: false,
		startsAt: new Date(`2026-10-0${number}T23:00:00Z`),
		...extra,
	}
}

describe("isEliminationGame", () => {
	it("is true when one side clinches with a win", () => {
		const games = [game(1, "home"), game(2)]
		expect(isEliminationGame(games[1], games, 3)).toBe(true)
	})

	it("is true for a winner-take-all game", () => {
		const games = [game(1, "home"), game(2, "away"), game(3)]
		expect(isEliminationGame(games[2], games, 3)).toBe(true)
	})

	it("is false when nobody can clinch yet", () => {
		const games = [game(1)]
		expect(isEliminationGame(games[0], games, 3)).toBe(false)
	})

	it("is false for a final game", () => {
		const games = [game(1, "home"), game(2, "home")]
		expect(isEliminationGame(games[1], games, 3)).toBe(false)
	})

	it("is false for an if-necessary game the series hasn't reached", () => {
		const games = [game(1, "home"), game(2), game(3, undefined, { ifNecessary: true })]
		expect(isEliminationGame(games[2], games, 3)).toBe(false)
	})
})

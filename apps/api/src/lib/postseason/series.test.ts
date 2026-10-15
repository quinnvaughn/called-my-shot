import { describe, expect, it } from "vitest"
import {
	decidingGameNumber,
	isGameConfirmed,
	parsePostseasonNote,
	roundLabel,
	lastAskableGame,
	type SeriesGame,
	seriesOutlook,
	seriesStage,
	seriesSummary,
	seriesWinner,
	standingBefore,
	unplayedGames,
} from "./series"

const HOME = "home-team"
const AWAY = "away-team"

// Game n of a series between HOME and AWAY. winner: which side took it, if
// it's final.
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

const abbreviation = (teamId: string) => (teamId === HOME ? "SEA" : "DET")

describe("parsePostseasonNote", () => {
	it("reads a series game's round and number", () => {
		expect(parsePostseasonNote("NLDS - Game 4")).toEqual({
			round: "NLDS",
			gameNumber: 4,
			ifNecessary: false,
		})
	})

	it("flags a game ESPN lists before it's needed", () => {
		expect(parsePostseasonNote("First Round - Game 3 If Necessary")).toEqual({
			round: "First Round",
			gameNumber: 3,
			ifNecessary: true,
		})
	})

	it("keeps a single-game round's name as its round", () => {
		expect(parsePostseasonNote("AFC Championship")).toEqual({
			round: "AFC Championship",
			gameNumber: null,
			ifNecessary: false,
		})
	})

	it("reads nothing from a missing note", () => {
		expect(parsePostseasonNote(undefined)).toBeNull()
		expect(parsePostseasonNote("  ")).toBeNull()
	})
})

describe("roundLabel", () => {
	it("spells out MLB's Wild Card round and leaves the rest alone", () => {
		expect(roundLabel("ALWC")).toBe("AL Wild Card Series")
		expect(roundLabel("NLDS")).toBe("NLDS")
		expect(roundLabel("World Series")).toBe("World Series")
	})
})

describe("series state", () => {
	it("finds the winner once a team has won enough games", () => {
		expect(seriesWinner([game(1, "home"), game(2, "home")], 3)).toBe(HOME)
		expect(seriesWinner([game(1, "home"), game(2, "away")], 3)).toBeNull()
		expect(seriesWinner([game(1, "home"), game(2, "home")], null)).toBeNull()
	})

	it("confirms an If Necessary game only once the series reaches it", () => {
		const three = game(3, undefined, { ifNecessary: true })
		expect(isGameConfirmed(three, [game(1, "home"), game(2), three], 3)).toBe(
			false,
		)
		expect(
			isGameConfirmed(three, [game(1, "home"), game(2, "away"), three], 3),
		).toBe(true)
		expect(
			isGameConfirmed(three, [game(1, "home"), game(2, "home"), three], 3),
		).toBe(false)
	})

	it("doesn't confirm a game the series ended before, flagged or not", () => {
		const four = game(4)
		expect(
			isGameConfirmed(
				four,
				[game(1, "home"), game(2, "home"), game(3, "home"), four],
				5,
			),
		).toBe(false)
	})

	it("drops the games a decided series never played", () => {
		const games = [
			game(1, "away"),
			game(2, "away"),
			game(3, "away"),
			game(4, undefined, { ifNecessary: true }),
			game(5, undefined, { ifNecessary: true }),
		]
		expect(unplayedGames(games, 5).map((g) => g.id)).toEqual(["g4", "g5"])
		expect(decidingGameNumber(games, 5)).toBe(3)
		expect(unplayedGames(games.slice(0, 2), 5)).toEqual([])
	})

	it("names who can clinch going into a game", () => {
		const games = [game(1, "home"), game(2, "away"), game(3, "home"), game(4)]
		expect(standingBefore(games[3] as SeriesGame, games, 5)).toEqual({
			homeWins: 2,
			awayWins: 1,
			clinchTeamIds: [HOME],
		})
		const decider = [...games.slice(0, 3), game(4, "away"), game(5)]
		expect(
			standingBefore(decider[4] as SeriesGame, decider, 5).clinchTeamIds,
		).toEqual([HOME, AWAY])
	})

	it("sums the series up before a game and after it goes final", () => {
		const games = [game(1, "home"), game(2, "away"), game(3)]
		expect(seriesSummary(games[0] as SeriesGame, games, 3, abbreviation)).toBe(
			"SEA leads 1-0",
		)
		expect(seriesSummary(game(1), [game(1), game(2)], 3, abbreviation)).toBe(
			"Best of 3",
		)
		expect(seriesSummary(games[2] as SeriesGame, games, 3, abbreviation)).toBe(
			"Series tied 1-1",
		)
		const done = [game(1, "home"), game(2, "away"), game(3, "away")]
		expect(seriesSummary(done[2] as SeriesGame, done, 3, abbreviation)).toBe(
			"DET wins series 2-1",
		)
	})
})

describe("seriesOutlook", () => {
	const even = { teamAId: HOME, teamAHome: 0.5, teamBHome: 0.5 }

	it("reads an even best-of-7 before Game 1", () => {
		const outlook = seriesOutlook([], 7, AWAY, even)
		expect(outlook.teamAWins).toBeCloseTo(0.5, 10)
		// Both sides at 3 after six even games: C(6,3) / 2^6.
		expect(outlook.goesDistance).toBeCloseTo(20 / 64, 10)
	})

	it("moves with the series score", () => {
		const games = [game(1, "home"), game(2, "home"), game(3, "home")]
		const outlook = seriesOutlook(games, 7, AWAY, even)
		// Down 0-3, the other side has to win four straight.
		expect(outlook.teamAWins).toBeCloseTo(1 - 1 / 16, 10)
		expect(outlook.goesDistance).toBeCloseTo(1 / 8, 10)
	})

	it("plays each game at its own home side's chance", () => {
		// Best of 3, both games so far split; Game 3 is at AWAY's park.
		const games = [
			game(1, "home"),
			game(2, "away"),
			game(3, undefined, { homeTeamId: AWAY, awayTeamId: HOME }),
		]
		const outlook = seriesOutlook(games, 3, AWAY, {
			teamAId: HOME,
			teamAHome: 0.6,
			teamBHome: 0.7,
		})
		expect(outlook.teamAWins).toBeCloseTo(0.3, 10)
		expect(outlook.goesDistance).toBe(1)
	})

	it("is settled once a side has won", () => {
		const games = [game(1, "away"), game(2, "away")]
		expect(seriesOutlook(games, 3, AWAY, even)).toEqual({
			teamAWins: 0,
			goesDistance: 0,
		})
	})
})

describe("seriesStage", () => {
	it("counts the final games and names the next one", () => {
		expect(seriesStage([game(1, "home"), game(2, "away"), game(3)])).toEqual({
			gamesPlayed: 2,
			nextGameNumber: 3,
		})
	})
})

describe("lastAskableGame", () => {
	it("stops the distance question a game before the winner", () => {
		expect(lastAskableGame("winner", 7)).toBe(7)
		expect(lastAskableGame("distance", 7)).toBe(6)
	})
})

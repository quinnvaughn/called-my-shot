import { describe, expect, it } from "vitest"
import { cardFactParts, cardFactText } from "./card-fact"

describe("cardFactText", () => {
	it("counts a line's hits over the games behind them", () => {
		expect(
			cardFactText({
				kind: "LINE_HITS",
				statLabel: "Points",
				line: 24.5,
				sides: [{ label: "Jayson Tatum", games: 10, hits: 7, mean: 26.1 }],
			}),
		).toBe("Over 24.5 in 7 of last 10 games")
	})

	it("says how many games there were early in a season", () => {
		expect(
			cardFactText({
				kind: "LINE_HITS",
				statLabel: "Points",
				line: 24.5,
				sides: [{ label: "Jayson Tatum", games: 4, hits: 3, mean: 26.1 }],
			}),
		).toBe("Over 24.5 in 3 of last 4 games")
	})

	it("counts both teams' games against a game total", () => {
		expect(
			cardFactText({
				kind: "TOTAL_HITS",
				statLabel: "Points",
				line: 224.5,
				sides: [
					{ label: "LAL", games: 10, hits: 6, mean: 228 },
					{ label: "BOS", games: 10, hits: 4, mean: 219 },
				],
			}),
		).toBe("Combined over 224.5 in 6 of LAL's last 10, 4 of BOS's last 10")
	})

	it("averages a head to head side by side in the stat's own words", () => {
		expect(
			cardFactText({
				kind: "AVERAGES",
				statLabel: "Rebounds",
				sides: [
					{ label: "LeBron James", games: 10, mean: 7.8 },
					{ label: "Anthony Davis", games: 10, mean: 11.25 },
				],
			}),
		).toBe("Last 10 avg: LeBron James 7.8, Anthony Davis 11.3 rebounds")
	})

	it("calls it recent when the two sides' samples differ", () => {
		expect(
			cardFactText({
				kind: "AVERAGES",
				statLabel: "Rebounds",
				sides: [
					{ label: "LeBron James", games: 10, mean: 7.8 },
					{ label: "Anthony Davis", games: 6, mean: 11 },
				],
			}),
		).toBe("Recent avg: LeBron James 7.8, Anthony Davis 11.0 rebounds")
	})

	it("counts the games the leader favorite led", () => {
		expect(
			cardFactText({
				kind: "LEADER_HITS",
				statLabel: "Rebounds",
				sides: [{ label: "Anthony Davis", games: 10, hits: 6, mean: 11 }],
			}),
		).toBe("Anthony Davis led the game in rebounds in 6 of last 10 games")
	})

	it("keeps an acronym stat as written", () => {
		expect(
			cardFactText({
				kind: "LEADER_HITS",
				statLabel: "RBIs",
				sides: [{ label: "Aaron Judge", games: 10, hits: 3, mean: 1 }],
			}),
		).toBe("Aaron Judge led the game in RBIs in 3 of last 10 games")
	})

	it("marks the figures apart from the words", () => {
		expect(
			cardFactParts({
				kind: "LINE_HITS",
				statLabel: "Points",
				line: 24.5,
				sides: [{ label: "Jayson Tatum", games: 10, hits: 7, mean: 26.1 }],
			}),
		).toEqual([
			"Over ",
			{ figure: "24.5" },
			" in ",
			{ figure: "7" },
			" of last 10 games",
		])
	})
})

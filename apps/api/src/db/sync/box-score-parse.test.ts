import { describe, expect, it } from "vitest"
import { espnFixture } from "../../test/helpers"
import {
	defaultStatParser,
	parseBoxScore,
	parseInnings,
	parseMadeAttempted,
	parseStatNumber,
} from "./box-score-parse"
import type { EspnGameSummary } from "./espn-client"

// Trimmed from live ESPN summaries (2026-09-12) down to the fields the parser
// reads: NBA 401811029, NFL 401872657, MLB 401816883. MLB's plays are only its
// hits, each with just its type and batter. NHL (2026-10-01): 401803653, a
// regulation final, and 401803652, decided in a shootout.
const summaryFixture = (league: "nba" | "nfl" | "mlb" | "nhl") =>
	espnFixture<EspnGameSummary>(`${league}-summary.json`)
const nhlShootoutFixture = () =>
	espnFixture<EspnGameSummary>("nhl-summary-shootout.json")

describe("parseBoxScore", () => {
	it("reads an NBA box score's scores, players and team stats", () => {
		const box = parseBoxScore(summaryFixture("nba"))
		expect(box.isFinal).toBe(true)
		expect(box.scoreByEspnTeamId.get("2")).toBe(144)
		expect(box.scoreByEspnTeamId.get("3")).toBe(118)
		expect(box.athletes.get("4869780")?.stats.get("points")).toBe("25")
		expect(box.athletes.get("3442")?.didNotPlay).toBe(true)
		expect(box.teamStats.get("3")?.get("totalRebounds")).toBe("44")
	})

	it("prefixes NFL stats with their table and keeps each table's totals", () => {
		const box = parseBoxScore(summaryFixture("nfl"))
		expect(box.athletes.get("4361741")?.stats.get("passing.passingYards")).toBe(
			"205",
		)
		expect(box.tableTotals.get("25")?.get("passing.passingTouchdowns")).toBe(
			"3",
		)
		expect(box.tableTotals.get("25")?.get("interceptions.interceptions")).toBe(
			"1",
		)
	})

	it("groups MLB team stats and keeps pitching decisions", () => {
		const box = parseBoxScore(summaryFixture("mlb"))
		expect(box.teamStats.get("27")?.get("batting.hits")).toBe("8")
		expect(box.athletes.get("41197")?.stats.get("batting.hits")).toBe("2")
		expect(box.athletes.get("4019484")?.notes).toEqual([
			{ type: "pitchingDecision", text: "L, 5-10" },
		])
	})

	it("counts an MLB batter's total bases off the play-by-play", () => {
		const box = parseBoxScore(summaryFixture("mlb"))
		expect(box.athletes.get("41197")?.stats.get("batting.totalBases")).toBe("4")
		expect(box.athletes.get("4417606")?.stats.get("batting.totalBases")).toBe(
			"0",
		)
	})

	it("counts bunt singles and ground rule doubles as hits", () => {
		const summary = summaryFixture("mlb")
		const batter = (text: string) => ({
			type: { text },
			participants: [{ athlete: { id: "4417606" }, type: "batter" }],
		})
		summary.plays = [
			...(summary.plays ?? []),
			batter("Bunt Single"),
			batter("Ground Rule Double"),
		]
		const athlete = summary.boxscore?.players?.[0]?.statistics
			.find((table) => table.type === "batting")
			?.athletes.find((a) => a.athlete.id === "4417606")
		if (athlete) athlete.stats[3] = "2"

		const box = parseBoxScore(summary)
		expect(box.athletes.get("4417606")?.stats.get("batting.totalBases")).toBe(
			"3",
		)
	})

	it("counts a ball in play ESPN logged twice in one at-bat once", () => {
		const summary = summaryFixture("mlb")
		const double = {
			type: { text: "Double" },
			atBatId: "4018168830101",
			participants: [{ athlete: { id: "4417606" }, type: "batter" }],
		}
		summary.plays = [...(summary.plays ?? []), double, double]
		const athlete = summary.boxscore?.players?.[0]?.statistics
			.find((table) => table.type === "batting")
			?.athletes.find((a) => a.athlete.id === "4417606")
		if (athlete) athlete.stats[3] = "1"

		const box = parseBoxScore(summary)
		expect(box.athletes.get("4417606")?.stats.get("batting.totalBases")).toBe(
			"2",
		)
	})

	it("leaves total bases unset when the play-by-play's hits don't match H", () => {
		const summary = summaryFixture("mlb")
		summary.plays = summary.plays?.filter(
			(play) =>
				!play.participants?.some((p) => p.athlete.id === "41197") ||
				play.type?.text !== "Single",
		)
		const box = parseBoxScore(summary)
		expect(box.athletes.get("41197")?.stats.has("batting.totalBases")).toBe(
			false,
		)
	})

	it("files NHL forwards and defensemen under one skaters table", () => {
		const box = parseBoxScore(summaryFixture("nhl"))
		expect(box.isFinal).toBe(true)
		expect(box.athletes.get("4588750")?.stats.get("skaters.goals")).toBe("2")
		expect(box.athletes.get("4588750")?.stats.get("skaters.shotsTotal")).toBe(
			"3",
		)
		expect(box.athletes.get("4697705")?.stats.get("goalies.saves")).toBe("29")
		expect(box.athletes.get("4697705")?.stats.has("skaters.goals")).toBe(false)
	})

	it("adds up an NHL skater's points and each team's totals", () => {
		const box = parseBoxScore(summaryFixture("nhl"))
		expect(box.athletes.get("4588750")?.stats.get("skaters.points")).toBe("3")
		expect(box.tableTotals.get("13")?.get("skaters.goals")).toBe("4")
		expect(box.tableTotals.get("13")?.get("skaters.shotsTotal")).toBe("21")
		expect(box.tableTotals.get("20")?.get("goalies.saves")).toBe("17")
	})

	it("takes NHL team goals off the final score in regulation", () => {
		const box = parseBoxScore(summaryFixture("nhl"))
		expect(box.teamStats.get("13")?.get("goals")).toBe("4")
		expect(box.teamStats.get("20")?.get("goals")).toBe("2")
	})

	it("leaves the shootout out of NHL team goals but not the final score", () => {
		const box = parseBoxScore(nhlShootoutFixture())
		expect(box.scoreByEspnTeamId.get("9")).toBe(4)
		expect(box.teamStats.get("9")?.get("goals")).toBe("3")
		expect(box.tableTotals.get("9")?.get("skaters.goals")).toBe("3")
		expect(box.teamStats.get("2")?.get("goals")).toBe("3")
	})

	it("derives no hockey stats for another league", () => {
		const box = parseBoxScore(summaryFixture("nba"))
		expect(box.teamStats.get("3")?.has("goals")).toBe(false)
	})

	it("isn't final until ESPN marks the game completed with a full box score", () => {
		const partial = summaryFixture("nba")
		partial.header.competitions[0].boxscoreSource = "basic"
		expect(parseBoxScore(partial).isFinal).toBe(false)

		const postponed = summaryFixture("nba")
		postponed.header.competitions[0].status = {
			type: { name: "STATUS_POSTPONED", state: "post", completed: false },
		}
		expect(parseBoxScore(postponed).isFinal).toBe(false)
	})
})

describe("stat value parsing", () => {
	it("reads ESPN's blanks as no value", () => {
		expect(parseStatNumber("12")).toBe(12)
		expect(parseStatNumber("--")).toBeNull()
		expect(parseStatNumber("")).toBeNull()
		expect(parseStatNumber(undefined)).toBeNull()
	})

	it("takes the made side of a made-attempted pair", () => {
		expect(parseMadeAttempted("8-12")).toBe(8)
	})

	it("counts outs after the point in baseball innings", () => {
		expect(parseInnings("5.0")).toBe(5)
		expect(parseInnings("1.2")).toBeCloseTo(5 / 3)
		expect(parseInnings("0.1")).toBeCloseTo(1 / 3)
	})
})

describe("defaultStatParser", () => {
	it("reads a paired column as its first side", () => {
		expect(defaultStatParser("batting.hits-atBats")("2-4")).toBe(2)
		expect(defaultStatParser("pitching.pitches-strikes")("95-60")).toBe(95)
		expect(
			defaultStatParser(
				"threePointFieldGoalsMade-threePointFieldGoalsAttempted",
			)("4-9"),
		).toBe(4)
	})

	it("reads a baseball innings column as thirds", () => {
		expect(
			defaultStatParser("pitching.fullInnings.partInnings")("5.2"),
		).toBeCloseTo(17 / 3)
	})

	it("reads anything else as a plain number", () => {
		expect(defaultStatParser("points")("31")).toBe(31)
		expect(defaultStatParser("batting.RBIs")("--")).toBeNull()
	})

	// The dotted table prefix is not part of the column name, and a key can
	// carry dots of its own, so only the last segment decides.
	it("looks at the column, not the table prefix", () => {
		expect(defaultStatParser("receiving.receptions")("7")).toBe(7)
	})
})

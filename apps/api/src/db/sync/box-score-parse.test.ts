import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
	parseBoxScore,
	parseInnings,
	parseMadeAttempted,
	parseStatNumber,
} from "./box-score-parse"
import type { EspnGameSummary } from "./espn-client"

// Trimmed from live ESPN summaries (2026-09-12) down to the fields the parser
// reads: NBA 401811029, NFL 401872657, MLB 401816883.
const summaryFixture = (league: "nba" | "nfl" | "mlb") =>
	JSON.parse(
		readFileSync(
			new URL(`./fixtures/espn/${league}-summary.json`, import.meta.url),
			"utf8",
		),
	) as EspnGameSummary

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

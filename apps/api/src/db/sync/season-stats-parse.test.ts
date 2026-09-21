import { describe, expect, it } from "vitest"
import { espnFixture } from "../../test/helpers"
import type { EspnSeasonStatistics, EspnStandingsGroup } from "./espn-client"
import {
	flattenCategorizedStatistics,
	parseStandingsWins,
} from "./season-stats-parse"

// Trimmed from live ESPN responses (2026-09-12): regular-season statistics for
// NBA athlete 4869780 (2025-26) and MLB athlete 41197 (2025), and each league's
// 2025 standings.
const fixture = <T>(name: string) => espnFixture<T>(`${name}.json`)

describe("flattenCategorizedStatistics", () => {
	it("keys every stat by its category", () => {
		const nba = flattenCategorizedStatistics(
			fixture<EspnSeasonStatistics>("season-athlete-nba-4869780"),
		)
		expect(nba.get("offensive.points")).toBe(948)
		expect(nba.get("general.gamesPlayed")).toBe(81)

		const mlb = flattenCategorizedStatistics(
			fixture<EspnSeasonStatistics>("season-athlete-mlb-41197"),
		)
		expect(mlb.get("batting.avg")).toBeCloseTo(0.296146)
		expect(mlb.get("batting.gamesPlayed")).toBe(133)
	})
})

describe("parseStandingsWins", () => {
	it("finds every team however deep the league nests its standings", () => {
		expect(
			parseStandingsWins(fixture<EspnStandingsGroup>("standings-nba")).get("3"),
		).toBe(26)
		expect(
			parseStandingsWins(fixture<EspnStandingsGroup>("standings-nfl")).get(
				"25",
			),
		).toBe(12)
		expect(
			parseStandingsWins(fixture<EspnStandingsGroup>("standings-mlb")).get(
				"27",
			),
		).toBe(55)
	})
})

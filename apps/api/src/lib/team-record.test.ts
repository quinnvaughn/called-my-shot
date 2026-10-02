import { describe, expect, it } from "vitest"
import { parseTeamRecord, recordGames } from "./team-record"

describe("parseTeamRecord", () => {
	it("reads a third count as ties outside the NHL", () => {
		expect(parseTeamRecord("12-4-1", "nfl")).toEqual({
			wins: 12,
			losses: 4,
			ties: 1,
			otLosses: null,
		})
		expect(parseTeamRecord("31-9", "nba")).toEqual({
			wins: 31,
			losses: 9,
			ties: 0,
			otLosses: null,
		})
	})

	it("reads the NHL's third count as overtime losses and drops its points", () => {
		expect(parseTeamRecord("48-20-12, 108 PTS", "nhl")).toEqual({
			wins: 48,
			losses: 20,
			ties: 0,
			otLosses: 12,
		})
		expect(parseTeamRecord("7-2-1, 0 PTS", "nhl")).toEqual({
			wins: 7,
			losses: 2,
			ties: 0,
			otLosses: 1,
		})
	})

	it("reads a split with no games yet as zeroes and junk as nothing", () => {
		expect(parseTeamRecord("-", "nhl")).toEqual({
			wins: 0,
			losses: 0,
			ties: 0,
			otLosses: 0,
		})
		expect(parseTeamRecord(null, "nba")).toBeNull()
		expect(parseTeamRecord("W3", "nba")).toBeNull()
	})
})

describe("recordGames", () => {
	it("counts overtime losses as games", () => {
		expect(recordGames({ wins: 48, losses: 20, ties: 0, otLosses: 12 })).toBe(
			80,
		)
	})
})

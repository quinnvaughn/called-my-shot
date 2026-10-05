import { describe, expect, it } from "vitest"
import { canLeadStat } from "./leader-positions"

const player = (position: string | null, positions: string[] = []) => ({
	position,
	positions: positions.length ? positions : position ? [position] : [],
})

describe("canLeadStat", () => {
	it("keeps offense out of a sacks pool", () => {
		expect(canLeadStat(player("DE"), "nfl", "Sacks")).toBe(true)
		expect(canLeadStat(player("QB"), "nfl", "Sacks")).toBe(false)
		expect(canLeadStat(player("PK"), "nfl", "Sacks")).toBe(false)
	})

	it("keeps quarterbacks and linemen out of a receptions pool", () => {
		expect(canLeadStat(player("WR"), "nfl", "Receptions")).toBe(true)
		expect(canLeadStat(player("RB"), "nfl", "Receptions")).toBe(true)
		expect(canLeadStat(player("QB"), "nfl", "Receptions")).toBe(false)
		expect(canLeadStat(player("OT"), "nfl", "Receptions")).toBe(false)
	})

	it("judges an MLB player by primary position, not every spot they've played", () => {
		const moppingUpCatcher = player("C", ["RP", "P", "C", "1B"])
		expect(canLeadStat(moppingUpCatcher, "mlb", "Hits")).toBe(true)
		expect(canLeadStat(moppingUpCatcher, "mlb", "Strikeouts (Pitching)")).toBe(
			false,
		)
	})

	it("keeps a two-way starter in both pools", () => {
		const twoWay = player("DH", ["P", "DH", "SP"])
		expect(canLeadStat(twoWay, "mlb", "Hits")).toBe(true)
		expect(canLeadStat(twoWay, "mlb", "Strikeouts (Pitching)")).toBe(true)
	})

	it("splits NHL skaters from goalies", () => {
		expect(canLeadStat(player("G"), "nhl", "Shots on Goal")).toBe(false)
		expect(canLeadStat(player("G"), "nhl", "Saves")).toBe(true)
		expect(canLeadStat(player("D"), "nhl", "Saves")).toBe(false)
	})

	it("leaves every position in when the stat has no entry", () => {
		expect(canLeadStat(player("C"), "nba", "Assists")).toBe(true)
		expect(canLeadStat(player("QB"), "nfl", "Some Custom Metric")).toBe(true)
		expect(canLeadStat(player("QB"), "nfl", null)).toBe(true)
	})
})

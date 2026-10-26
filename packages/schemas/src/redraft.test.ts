import { describe, expect, it } from "vitest"
import { redraftLengths, redraftMove } from "./redraft"

const summary = (lengths: ReturnType<typeof redraftLengths>) =>
	lengths.map((l) => `${l.label} ${l.count}${l.isDefault ? "*" : ""}`)

describe("redraftLengths", () => {
	it("offers each league its own lengths and default", () => {
		expect(summary(redraftLengths("nba", 2003, 29))).toEqual([
			"Top 5 5",
			"Top 10 10",
			"Lottery 14*",
			"First round 29",
		])
		expect(summary(redraftLengths("nfl", 2000, 31))).toEqual([
			"Top 10 10",
			"First round 31*",
		])
		expect(summary(redraftLengths("nhl", 2003, 30))).toEqual([
			"Top 5 5",
			"Top 10 10*",
			"First round 30",
		])
	})

	it("calls the NBA's first 14 the lottery only once there was one", () => {
		expect(redraftLengths("nba", 1984, 24)[2]?.label).toBe("Top 14")
		expect(redraftLengths("nba", 1985, 24)[2]?.label).toBe("Lottery")
	})

	it("drops a length that isn't shorter than a small first round, and defaults to the first round instead", () => {
		expect(summary(redraftLengths("nba", 1966, 10))).toEqual([
			"Top 5 5",
			"First round 10*",
		])
		expect(summary(redraftLengths("nhl", 1963, 6))).toEqual([
			"Top 5 5",
			"First round 6*",
		])
	})
})

describe("redraftMove", () => {
	it("measures a pick against where they really went", () => {
		expect(redraftMove(2, 5)).toEqual({ kind: "up", by: 3 })
		expect(redraftMove(4, 3)).toEqual({ kind: "down", by: 1 })
		expect(redraftMove(1, 1)).toEqual({ kind: "same" })
		expect(redraftMove(7, null)).toEqual({ kind: "undrafted" })
	})
})

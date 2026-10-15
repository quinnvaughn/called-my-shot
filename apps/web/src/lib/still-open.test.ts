import { describe, expect, it } from "vitest"
import { groupSplit, locksInLabel } from "./still-open"

const yesNo = [
	{ id: "y", label: "Yes" },
	{ id: "n", label: "No" },
]

describe("groupSplit", () => {
	it("gives both sides of a two-option question, in option order", () => {
		expect(
			groupSplit({
				memberCount: 9,
				picks: [
					{ optionId: "n", count: 5 },
					{ optionId: "y", count: 4 },
				],
				medianGuess: null,
				options: yesNo,
				rateStat: false,
			}),
		).toEqual({
			kind: "sides",
			first: { label: "Yes", count: 4 },
			second: { label: "No", count: 5 },
		})
	})

	it("counts a side nobody took as zero", () => {
		expect(
			groupSplit({
				memberCount: 3,
				picks: [{ optionId: "y", count: 3 }],
				medianGuess: null,
				options: yesNo,
				rateStat: false,
			}),
		).toMatchObject({ second: { label: "No", count: 0 } })
	})

	it("names only the leader with more than two options", () => {
		expect(
			groupSplit({
				memberCount: 6,
				picks: [
					{ optionId: "k", count: 2 },
					{ optionId: "h", count: 1 },
				],
				medianGuess: null,
				options: [
					{ id: "k", label: "Kelce" },
					{ id: "h", label: "Henry" },
					{ id: "a", label: "Andrews" },
				],
				rateStat: false,
			}),
		).toEqual({ kind: "leader", text: "Kelce leads · 2 of 6" })
	})

	it("calls a shared lead a tie", () => {
		expect(
			groupSplit({
				memberCount: 4,
				picks: [
					{ optionId: "k", count: 2 },
					{ optionId: "h", count: 2 },
				],
				medianGuess: null,
				options: [
					{ id: "k", label: "Kelce" },
					{ id: "h", label: "Henry" },
					{ id: "a", label: "Andrews" },
				],
				rateStat: false,
			}),
		).toEqual({ kind: "leader", text: "Tied at the top · 2 each" })
	})

	it("gives the median for a numeric guess", () => {
		expect(
			groupSplit({
				memberCount: 3,
				picks: [],
				medianGuess: 287.5,
				options: [],
				rateStat: false,
			}),
		).toEqual({ kind: "median", text: "Group median 287.5" })
	})
})

describe("locksInLabel", () => {
	const now = Date.parse("2026-10-15T18:00:00Z")

	it("counts minutes inside the hour", () => {
		expect(locksInLabel("2026-10-15T18:40:00Z", now)).toBe("Locks in 40m")
	})

	it("counts whole hours past it", () => {
		expect(locksInLabel("2026-10-15T23:59:00Z", now)).toBe("Locks in 5h")
	})
})

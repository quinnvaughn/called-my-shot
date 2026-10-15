import { DateTime } from "luxon"
import { describe, expect, it } from "vitest"
import { raceEndsLabel, raceRowNote, viewerStandingLine } from "./week-race"

const member = (
	rank: number | null,
	totalPoints: number,
	settledCallCount = 3,
	name = "Alex",
) => ({ rank, totalPoints, settledCallCount, name })

describe("viewerStandingLine", () => {
	it("measures a chaser against the member just above", () => {
		expect(viewerStandingLine(member(6, 41), member(5, 97), 3)).toBe(
			"56 points behind Alex",
		)
	})

	it("measures the leader against second place", () => {
		expect(viewerStandingLine(member(1, 130), member(2, 118), 3)).toBe(
			"12 points ahead of Alex",
		)
	})

	it("calls an even score a tie", () => {
		expect(viewerStandingLine(member(2, 50), member(1, 50), 3)).toBe(
			"Tied with Alex",
		)
	})

	it("adds what's left to qualify", () => {
		expect(viewerStandingLine(member(4, 60, 2), member(3, 70), 3)).toBe(
			"10 points behind Alex · 1 call to qualify",
		)
	})

	it("only counts toward qualifying while unranked", () => {
		expect(viewerStandingLine(member(null, 0, 0), member(5, 20), 3)).toBe(
			"3 calls to qualify",
		)
	})

	it("has nothing to say for a qualified leader alone on the board", () => {
		expect(viewerStandingLine(member(1, 40), null, 3)).toBeNull()
	})
})

describe("raceRowNote", () => {
	it("counts open calls once qualified", () => {
		expect(raceRowNote({ ...member(1, 40), openCallCount: 4 }, 3)).toBe(
			"4 open",
		)
	})

	it("shows progress toward qualifying before that", () => {
		expect(raceRowNote({ ...member(1, 40, 2), openCallCount: 4 }, 3)).toBe(
			"2 of 3 calls",
		)
	})
})

describe("raceEndsLabel", () => {
	// Weeks end at Tuesday midnight in the sports time zone, so Monday is the
	// last day of this one.
	const endsAt = DateTime.fromISO("2026-10-20T00:00", {
		zone: "America/New_York",
	}).toISO() as string
	const at = (iso: string) => DateTime.fromISO(iso, { zone: "America/New_York" })

	it("names the closing day from midweek", () => {
		expect(raceEndsLabel(endsAt, at("2026-10-15T20:00"))).toBe("Ends Monday")
	})

	it("says tomorrow on Sunday", () => {
		expect(raceEndsLabel(endsAt, at("2026-10-18T13:00"))).toBe("Ends tomorrow")
	})

	it("says tonight on Monday", () => {
		expect(raceEndsLabel(endsAt, at("2026-10-19T23:30"))).toBe("Ends tonight")
	})
})

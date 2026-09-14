import { describe, expect, it } from "vitest"
import {
	buildSlateKey,
	formatSlateLabel,
	parseSlateKey,
	slateDayRange,
} from "./slate"

const nflGame = {
	// Sunday Sep 13 2026, 1pm ET.
	startsAt: new Date("2026-09-13T17:00:00Z"),
	seasonType: "regular" as const,
	weekNumber: 1,
	slot: "SUN_EARLY",
}

describe("buildSlateKey / parseSlateKey", () => {
	it("keys a week-league game by its week and slot", () => {
		const key = buildSlateKey(nflGame, "week", 2026)
		expect(key).toBe("2026-reg-w1-sun-early")
		expect(parseSlateKey(key)).toEqual({
			kind: "week_slot",
			seasonYear: 2026,
			seasonType: "regular",
			weekNumber: 1,
			slot: "SUN_EARLY",
		})
	})

	it("falls back to the ET day for a week-league game with no slot", () => {
		const key = buildSlateKey({ ...nflGame, slot: null }, "week", 2026)
		expect(key).toBe("2026-reg-w1-2026-09-13")
		expect(parseSlateKey(key)).toEqual({
			kind: "week_day",
			seasonYear: 2026,
			seasonType: "regular",
			weekNumber: 1,
			day: "2026-09-13",
		})
	})

	it("keys a date-league game by its ET day, not its UTC one", () => {
		// 10:30pm ET on the 14th is already the 15th in UTC.
		const startsAt = new Date("2026-09-15T02:30:00Z")
		const key = buildSlateKey(
			{ startsAt, seasonType: "regular", weekNumber: null, slot: null },
			"date",
			2026,
		)
		expect(key).toBe("2026-09-14")
		expect(parseSlateKey(key)).toEqual({ kind: "day", day: "2026-09-14" })

		const { start, end } = slateDayRange("2026-09-14")
		expect(startsAt >= start && startsAt < end).toBe(true)
	})

	it("rejects a key it didn't build", () => {
		expect(parseSlateKey("not-a-slate")).toBeNull()
	})
})

describe("formatSlateLabel", () => {
	it("names a slot by its broadcast window", () => {
		const slate = parseSlateKey("2026-reg-w3-sun-early")
		expect(slate && formatSlateLabel(slate, "nfl")).toBe("Week 3 Sunday Early")
	})

	it("marks a postseason week", () => {
		const slate = parseSlateKey("2026-post-w1-sat")
		expect(slate && formatSlateLabel(slate, "nfl")).toBe(
			"Postseason Week 1 Saturday",
		)
	})

	it("names a slotless week game by its weekday", () => {
		const slate = parseSlateKey("2026-reg-w16-2026-12-19")
		expect(slate && formatSlateLabel(slate, "nfl")).toBe("Week 16 Saturday")
	})

	it("names a date-league slate by its day", () => {
		const slate = parseSlateKey("2026-09-14")
		expect(slate && formatSlateLabel(slate, "mlb")).toBe("Sep 14")
	})
})

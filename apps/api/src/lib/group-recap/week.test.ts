import { describe, expect, it } from "vitest"
import { formatWeekLabel, lastCompletedWeek, weekContaining } from "./week"

describe("weekContaining", () => {
	it("starts the week on Tuesday in the sports time zone", () => {
		// Monday 11:30pm Eastern is still the week that began the Tuesday before.
		const mondayNight = new Date("2026-10-13T03:30:00Z")
		expect(weekContaining(mondayNight).key).toBe("2026-10-06")

		// Half an hour later it's Tuesday, and a new week.
		const tuesday = new Date("2026-10-13T04:30:00Z")
		const week = weekContaining(tuesday)
		expect(week.key).toBe("2026-10-13")
		expect(week.start.toISOString()).toBe("2026-10-13T04:00:00.000Z")
		expect(week.end.toISOString()).toBe("2026-10-20T04:00:00.000Z")
	})

	it("keeps seven calendar days across a DST change", () => {
		const week = weekContaining(new Date("2026-11-01T12:00:00Z"))
		expect(week.start.toISOString()).toBe("2026-10-27T04:00:00.000Z")
		// Clocks fall back on Nov 1, so the next Tuesday midnight is 05:00 UTC.
		expect(week.end.toISOString()).toBe("2026-11-03T05:00:00.000Z")
	})
})

describe("lastCompletedWeek", () => {
	it("is the week before the one in progress", () => {
		const tuesdayMorning = new Date("2026-10-13T09:00:00Z")
		expect(lastCompletedWeek(tuesdayMorning).key).toBe("2026-10-06")
		const friday = new Date("2026-10-16T15:00:00Z")
		expect(lastCompletedWeek(friday).key).toBe("2026-10-06")
	})
})

describe("formatWeekLabel", () => {
	it("names the Tuesday through the Monday", () => {
		expect(
			formatWeekLabel(weekContaining(new Date("2026-10-08T12:00:00Z"))),
		).toBe("Oct 6 to 12")
		expect(
			formatWeekLabel(weekContaining(new Date("2026-10-01T12:00:00Z"))),
		).toBe("Sep 29 to Oct 5")
	})
})

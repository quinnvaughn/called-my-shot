import { describe, expect, it } from "vitest"
import { dayLabel, rangeLabel, spanWeeks } from "./results-calendar"

describe("dayLabel", () => {
	it("names the weekday, month and day", () => {
		expect(dayLabel("2026-10-14")).toBe("Wed Oct 14")
	})
})

describe("rangeLabel", () => {
	it("leaves the year off a span inside the current year", () => {
		expect(rangeLabel("2026-08-09", "2026-10-03", "2026-10-14")).toBe(
			"Aug 9 – Oct 3",
		)
	})

	it("puts the year on the start of a span crossing into this year", () => {
		expect(rangeLabel("2025-12-01", "2026-01-31", "2026-10-14")).toBe(
			"Dec 1, 2025 – Jan 31",
		)
	})

	it("puts the year on both ends of a span crossing an earlier New Year", () => {
		expect(rangeLabel("2024-12-01", "2025-01-31", "2026-10-14")).toBe(
			"Dec 1, 2024 – Jan 31, 2025",
		)
	})

	it("puts the year on the end of a span from an earlier year", () => {
		expect(rangeLabel("2025-08-09", "2025-10-03", "2026-10-14")).toBe(
			"Aug 9 – Oct 3, 2025",
		)
	})
})

describe("spanWeeks", () => {
	it("counts both ends of the span", () => {
		expect(spanWeeks("2026-10-01", "2026-10-07")).toBe(1)
		expect(spanWeeks("2026-10-01", "2026-10-08")).toBe(2)
	})

	it("rounds a partial week up", () => {
		expect(spanWeeks("2026-07-01", "2026-10-14")).toBe(16)
	})
})

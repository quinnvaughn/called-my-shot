import { describe, expect, it } from "vitest"
import { formatCallDate, formatCallLead } from "./format-date"

describe("formatCallDate", () => {
	// The hydration guarantee. These both render on the server and again in
	// the browser, and a date that changes between the two is the one string
	// the call page exists to state.
	it("resolves against the sports zone, not the runtime's", () => {
		// 02:00 UTC is still the previous evening in ET.
		expect(formatCallDate("2026-01-01T02:00:00Z")).toBe("Dec 31, 2025")
	})

	it("always carries the year", () => {
		// A call made a year before it resolves is the whole point, so a bare
		// "Mar 3" quietly implying this year is not good enough.
		expect(formatCallDate("2026-03-03T18:00:00Z")).toBe("Mar 3, 2026")
	})
})

describe("formatCallLead", () => {
	it("says nothing about a gap under a month", () => {
		expect(
			formatCallLead("2026-03-01T18:00:00Z", "2026-03-08T18:00:00Z"),
		).toBeNull()
	})

	it("reports a gap of months", () => {
		expect(formatCallLead("2026-01-05T18:00:00Z", "2026-12-05T18:00:00Z")).toBe(
			"Called 11 months before it resolved",
		)
	})

	it("switches to years past twelve months", () => {
		expect(formatCallLead("2025-06-01T18:00:00Z", "2026-09-01T18:00:00Z")).toBe(
			"Called 1 year before it resolved",
		)
	})

	it("singularises a one-month gap", () => {
		expect(formatCallLead("2026-01-05T18:00:00Z", "2026-02-10T18:00:00Z")).toBe(
			"Called 1 month before it resolved",
		)
	})
})

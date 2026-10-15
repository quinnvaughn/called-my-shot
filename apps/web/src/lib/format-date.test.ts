import { describe, expect, it } from "vitest"
import {
	formatCallAge,
	formatCallDate,
	formatCallLead,
	formatCallTimestamp,
	formatNumericDate,
	formatTimeAgo,
} from "./format-date"

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

describe("formatCallTimestamp", () => {
	it("states the minute in the zone it's given, named", () => {
		expect(
			formatCallTimestamp("2026-01-01T02:00:00Z", "America/New_York"),
		).toBe("Dec 31, 2025, 9:00 PM EST")
		expect(
			formatCallTimestamp("2026-01-01T02:00:00Z", "America/Los_Angeles"),
		).toBe("Dec 31, 2025, 6:00 PM PST")
	})

	it("follows daylight time", () => {
		expect(
			formatCallTimestamp("2026-07-04T16:05:00Z", "America/New_York"),
		).toBe("Jul 4, 2026, 12:05 PM EDT")
	})
})

describe("formatCallAge", () => {
	const ET = "America/New_York"
	const now = Date.parse("2026-10-08T18:00:00Z")

	it("counts up through minutes, hours and days", () => {
		expect(formatCallAge("2026-10-08T17:59:30Z", now, ET)).toBe("just now")
		expect(formatCallAge("2026-10-08T17:55:00Z", now, ET)).toBe("5m ago")
		expect(formatCallAge("2026-10-08T15:00:00Z", now, ET)).toBe("3h ago")
		expect(formatCallAge("2026-10-06T18:00:00Z", now, ET)).toBe("2d ago")
	})

	it("reads a call stamped slightly ahead of the clock as just now", () => {
		expect(formatCallAge("2026-10-08T18:00:20Z", now, ET)).toBe("just now")
	})

	it("switches to the date past a week", () => {
		expect(formatCallAge("2026-09-30T18:00:00Z", now, ET)).toBe("Sep 30")
	})

	it("adds the year once it isn't this one", () => {
		expect(formatCallAge("2025-12-31T18:00:00Z", now, ET)).toBe("Dec 31, 2025")
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

describe("formatNumericDate", () => {
	it("writes month and day as numbers in the sports zone", () => {
		expect(formatNumericDate("2026-10-20T23:00:00Z")).toBe("10/20")
		// 02:00 UTC is still the previous evening in ET.
		expect(formatNumericDate("2026-10-21T02:00:00Z")).toBe("10/20")
	})
})

describe("formatTimeAgo", () => {
	const now = Date.parse("2026-03-10T12:00:00Z")

	it("counts minutes under an hour", () => {
		expect(formatTimeAgo("2026-03-10T11:15:00Z", now)).toBe("45m ago")
	})

	it("counts hours and minutes past that, without rolling into days", () => {
		expect(formatTimeAgo("2026-03-10T08:48:00Z", now)).toBe("3h 12m ago")
		expect(formatTimeAgo("2026-03-08T10:00:00Z", now)).toBe("50h 0m ago")
	})
})

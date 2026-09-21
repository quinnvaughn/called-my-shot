import { describe, expect, it } from "vitest"
import { HOUR_MS as HOUR } from "../time"
import { isSeasonResolutionDue } from "./season-due"

const ENDS = new Date("2026-04-12T23:00:00Z")
const season = { regularSeasonEndsAt: ENDS }
const hoursAfterEnd = (hours: number) => new Date(ENDS.getTime() + hours * HOUR)
const hoursBefore = (now: Date, hours: number) =>
	new Date(now.getTime() - hours * HOUR)

describe("isSeasonResolutionDue", () => {
	it("waits for ESPN's numbers to settle after the scheduled end", () => {
		expect(isSeasonResolutionDue(season, [], hoursAfterEnd(35))).toBe(false)
		expect(isSeasonResolutionDue(season, [], hoursAfterEnd(37))).toBe(true)
	})

	it("waits while a regular-season game is live or still to come", () => {
		const now = hoursAfterEnd(48)
		expect(
			isSeasonResolutionDue(season, [{ status: "live", startsAt: now }], now),
		).toBe(false)
		expect(
			isSeasonResolutionDue(
				season,
				[{ status: "scheduled", startsAt: hoursBefore(now, 24) }],
				now,
			),
		).toBe(false)
	})

	it("doesn't wait on a game left scheduled long after it should have started", () => {
		const now = hoursAfterEnd(120)
		expect(
			isSeasonResolutionDue(
				season,
				[{ status: "scheduled", startsAt: hoursBefore(now, 100) }],
				now,
			),
		).toBe(true)
	})
})

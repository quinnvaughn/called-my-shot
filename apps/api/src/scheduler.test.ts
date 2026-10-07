import { afterEach, describe, expect, it } from "vitest"
import { clearPendingForTests, markPending } from "./lib/pending-work"
import { HOUR_MS, MINUTE_MS } from "./lib/time"
import { setWorkCalendarForTests } from "./lib/work-calendar"
import { JOBS } from "./scheduler"

const NOW = new Date("2026-10-07T18:02:00Z")
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)

const gate = (name: string) => {
	const job = JOBS.find((j) => j.name === name)
	if (!job) throw new Error(`no job ${name}`)
	return (now: Date) => job.when?.(now) ?? true
}

afterEach(() => {
	setWorkCalendarForTests(null)
	clearPendingForTests()
})

describe("JOBS", () => {
	it("runs each job on its schedule, in this order", () => {
		expect(JOBS.map(({ name, cron }) => [name, cron])).toEqual([
			["sync-live-scores", "*/5 * * * *"],
			["sync-game-starters", "*/30 * * * *"],
			["auto-resolve-games", "2-59/10 * * * *"],
			["lock-overdue-questions", "*/15 * * * *"],
			["drain-email-digests", "*/5 * * * *"],
			["drain-game-reminders", "*/5 * * * *"],
			["drain-season-start-emails", "*/5 * * * *"],
			["drain-analytics-outbox", "* * * * *"],
			["daily-sync-sweep", "0 9 * * *"],
			["daily-mail-sweep", "0 13 * * *"],
		])
	})

	it("opens every gate before the calendar has loaded", () => {
		setWorkCalendarForTests(null)
		for (const name of [
			"sync-live-scores",
			"sync-game-starters",
			"auto-resolve-games",
			"drain-game-reminders",
		]) {
			expect(gate(name)(NOW)).toBe(true)
		}
	})

	it("keeps the game jobs shut with no game near", () => {
		setWorkCalendarForTests({ games: [], nextAutoResolveAt: null })
		for (const name of [
			"sync-live-scores",
			"sync-game-starters",
			"auto-resolve-games",
			"lock-overdue-questions",
			"drain-email-digests",
			"drain-game-reminders",
		]) {
			expect(gate(name)(NOW)).toBe(false)
		}
	})

	it("opens the game jobs for a game about to start", () => {
		setWorkCalendarForTests({
			games: [
				{
					id: "game-1",
					status: "scheduled",
					startsAt: at(30 * MINUTE_MS),
					startersSyncedAt: NOW,
					finalizedAt: null,
					leagueSlug: "nba",
				},
			],
			nextAutoResolveAt: null,
		})
		expect(gate("sync-live-scores")(NOW)).toBe(true)
		expect(gate("drain-game-reminders")(NOW)).toBe(true)
	})

	it("reads a due retry outside a game window on the first tick of the hour only", () => {
		setWorkCalendarForTests({ games: [], nextAutoResolveAt: at(-HOUR_MS) })
		expect(gate("auto-resolve-games")(NOW)).toBe(true)
		expect(gate("auto-resolve-games")(at(10 * MINUTE_MS))).toBe(false)
	})

	it("drains analytics only when this process queued some", () => {
		setWorkCalendarForTests({ games: [], nextAutoResolveAt: null })
		expect(gate("drain-analytics-outbox")(NOW)).toBe(false)
		markPending("analytics", NOW)
		expect(gate("drain-analytics-outbox")(NOW)).toBe(true)
		expect(gate("drain-analytics-outbox")(NOW)).toBe(false)
	})

	it("holds a digest outside a game window until its rows have settled", () => {
		setWorkCalendarForTests({ games: [], nextAutoResolveAt: null })
		markPending("digests", NOW)
		expect(gate("drain-email-digests")(at(5 * MINUTE_MS))).toBe(false)
		expect(gate("drain-email-digests")(at(15 * MINUTE_MS))).toBe(true)
	})
})

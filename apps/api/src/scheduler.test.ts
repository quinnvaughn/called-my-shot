import { describe, expect, it } from "vitest"
import { JOBS } from "./scheduler"

describe("JOBS", () => {
	it("runs each job on its schedule, in this order", () => {
		expect(JOBS.map(({ name, cron }) => [name, cron])).toEqual([
			["sync-live-scores", "*/5 * * * *"],
			["recompute-achievements", "* * * * *"],
			["reconcile-achievements", "30 11 * * *"],
			["lock-overdue-questions", "*/15 * * * *"],
			["sync-sports-data", "0 9 * * *"],
			["sync-game-starters", "*/30 * * * *"],
			["auto-resolve-games", "2-59/10 * * * *"],
			["auto-resolve-seasons", "30 10 * * *"],
			["auto-resolve-championships", "45 10 * * *"],
			["tune-lines", "0 11 * * *"],
			["tune-bands", "5 11 * * *"],
			["tune-leader-losses", "10 11 * * *"],
			["tune-title-losses", "15 11 * * *"],
			["drain-email-digests", "*/5 * * * *"],
			["drain-game-reminders", "*/5 * * * *"],
			["enqueue-season-start-emails", "0 13 * * *"],
			["drain-season-start-emails", "*/5 * * * *"],
			["drain-analytics-outbox", "* * * * *"],
		])
	})
})

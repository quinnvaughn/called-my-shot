import cron from "node-cron"
import { lockOverdueQuestions } from "./db/lock-overdue-questions"
import { syncSportsData } from "./db/sync/run"
import { syncLiveScores } from "./db/sync/sync-live-scores"
import { drainResolutionDigests } from "./lib/email-digest"

function runJob(name: string, fn: () => Promise<void>) {
	return async () => {
		try {
			await fn()
		} catch (err) {
			console.error(`[scheduler] ${name} failed:`, err)
		}
	}
}

export function startScheduler(): void {
	cron.schedule("*/5 * * * *", runJob("sync-live-scores", syncLiveScores), {
		name: "sync-live-scores",
		timezone: "UTC",
		noOverlap: true,
	})
	cron.schedule(
		"*/15 * * * *",
		runJob("lock-overdue-questions", lockOverdueQuestions),
		{ name: "lock-overdue-questions", timezone: "UTC", noOverlap: true },
	)
	cron.schedule("0 9 * * *", runJob("sync-sports-data", syncSportsData), {
		name: "sync-sports-data",
		timezone: "UTC",
		noOverlap: true,
	})
	// Every 5m, but each user's rows still have to clear the settling window
	// inside the job (see SETTLE_MINUTES) - the frequency is how quickly a
	// batch goes out once it's ripe, not how often anyone gets mailed.
	cron.schedule(
		"*/5 * * * *",
		runJob("drain-email-digests", async () => {
			await drainResolutionDigests()
		}),
		{ name: "drain-email-digests", timezone: "UTC", noOverlap: true },
	)
	console.log(
		"[scheduler] started: sync-live-scores */5m, lock-overdue-questions */15m, sync-sports-data daily 09:00 UTC, drain-email-digests */5m",
	)
}

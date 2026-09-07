import cron from "node-cron"
import { lockOverdueQuestions } from "./db/lock-overdue-questions"
import { syncSportsData } from "./db/sync/run"
import { syncLiveScores } from "./db/sync/sync-live-scores"
import {
	DRAIN_DIGESTS_LOCK,
	DRAIN_SEASON_START_LOCK,
	withAdvisoryLock,
} from "./lib/advisory-lock"
import { drainResolutionDigests } from "./lib/email-digest"
import {
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./lib/season-start-email"

// Every job runs under a lock named after it, so a tick that fires on all
// machines at once still runs the job exactly once across the fleet - see
// lib/advisory-lock.ts. The CLI scripts take the same locks by name, which is
// what keeps a drain run by hand from racing a tick.
function runJob(name: string, fn: () => Promise<void>) {
	return async () => {
		try {
			const { ran } = await withAdvisoryLock(name, fn)
			if (!ran) console.log(`[scheduler] ${name} skipped - held elsewhere`)
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
		runJob(DRAIN_DIGESTS_LOCK, async () => {
			await drainResolutionDigests()
		}),
		{ name: DRAIN_DIGESTS_LOCK, timezone: "UTC", noOverlap: true },
	)
	// 13:00 UTC is 9am Eastern - the hour this list is most likely to be read,
	// and the only reason the enqueue has a time of day at all: rows appear
	// only when this runs, and the drain below sends them within five minutes.
	// Runs daily rather than once per season because the announcement window
	// is a range (see LEAD_DAYS) - each day re-asks which seasons are close
	// enough, and the unique constraint makes every rerun after the first a
	// no-op for the same people.
	cron.schedule(
		"0 13 * * *",
		runJob("enqueue-season-start-emails", async () => {
			await enqueueSeasonStartEmails({ commit: true })
		}),
		{ name: "enqueue-season-start-emails", timezone: "UTC", noOverlap: true },
	)
	// Separate from the enqueue so one pass doesn't have to hand Resend the
	// whole user list in one go - each tick takes a capped batch, and a list
	// bigger than the cap spreads over the following ticks instead of
	// spiking a shared sending domain.
	cron.schedule(
		"*/5 * * * *",
		runJob(DRAIN_SEASON_START_LOCK, async () => {
			await drainSeasonStartEmails()
		}),
		{ name: DRAIN_SEASON_START_LOCK, timezone: "UTC", noOverlap: true },
	)
	console.log(
		"[scheduler] started: sync-live-scores */5m, lock-overdue-questions */15m, sync-sports-data daily 09:00 UTC, drain-email-digests */5m, enqueue-season-start-emails daily 13:00 UTC, drain-season-start-emails */5m",
	)
}

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
// enqueueSeasonStartEmails is imported alongside this one when the enqueue
// cron below is re-enabled.
import { drainSeasonStartEmails } from "./lib/season-start-email"

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
	// DISABLED - the enqueue side only. Season-start announcements are being
	// queued by hand for now (scripts/season-start-emails.ts --commit), so the
	// send time of the first one can be picked deliberately rather than landing
	// on whichever daily tick happens to follow a deploy. The drain below stays
	// scheduled either way: it is what actually sends whatever is queued, by
	// cron or by hand.
	//
	// Re-enabling means uncommenting this block AND the enqueueSeasonStartEmails
	// import at the top of the file. Until then no season announces itself, NBA
	// and MLB included.
	//
	// 13:00 UTC is 9am Eastern, the hour this list is most likely to be read,
	// and the only reason the enqueue has a time of day at all: rows appear only
	// when it runs, and the drain sends them within five minutes. Daily rather
	// than once per season because the announcement window is a range (see
	// LEAD_DAYS) - each day re-asks which seasons are close enough, and the
	// (user_id, season_id) primary key makes every rerun after the first a
	// no-op for the same people.
	//
	// cron.schedule(
	// 	"0 13 * * *",
	// 	runJob("enqueue-season-start-emails", async () => {
	// 		await enqueueSeasonStartEmails({ commit: true })
	// 	}),
	// 	{ name: "enqueue-season-start-emails", timezone: "UTC", noOverlap: true },
	// )
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
		"[scheduler] started: sync-live-scores */5m, lock-overdue-questions */15m, sync-sports-data daily 09:00 UTC, drain-email-digests */5m, drain-season-start-emails */5m (enqueue-season-start-emails disabled, queued by hand)",
	)
}

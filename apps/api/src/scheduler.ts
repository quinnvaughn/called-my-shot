import cron from "node-cron"
import { lockOverdueQuestions } from "./db/lock-overdue-questions"
import { autoResolveChampionships } from "./db/sync/auto-resolve-championships"
import { autoResolveGames } from "./db/sync/auto-resolve-games"
import { autoResolveSeasons } from "./db/sync/auto-resolve-seasons"
import { generateGameQuestions } from "./db/sync/generate-game-questions"
import { syncSportsData } from "./db/sync/run"
import { syncGameStarters } from "./db/sync/sync-game-starters"
import { syncLiveScores } from "./db/sync/sync-live-scores"
import { drainResolutionDigests } from "./lib/email-digest"
import { tuneLines } from "./lib/game-questions/tune-lines"
import {
	AUTO_RESOLVE_GAMES_LOCK,
	DRAIN_DIGESTS_LOCK,
	DRAIN_SEASON_START_LOCK,
	RECOMPUTE_ACHIEVEMENTS_LOCK,
	withJobLock,
} from "./lib/job-lock"
import {
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./lib/season-start-email"
import { enqueueAchievementRecomputes } from "./lib/streaks/backfill"
import { drainAchievementRecomputes } from "./lib/streaks/drain"

const RECONCILE_ACHIEVEMENTS_DAYS = 7

const drainAchievements = runJob(RECOMPUTE_ACHIEVEMENTS_LOCK, async () => {
	await drainAchievementRecomputes()
})

// Every job runs under a lease named after it, so a tick that fires on all
// machines at once still runs the job exactly once across the fleet - see
// lib/job-lock.ts. The CLI scripts take the same locks by name, which is
// what keeps a drain run by hand from racing a tick.
function runJob(name: string, fn: () => Promise<void>) {
	return async () => {
		try {
			const { ran } = await withJobLock(name, fn)
			if (!ran) console.log(`[scheduler] ${name} skipped - held elsewhere`)
		} catch (err) {
			console.error(`[scheduler] ${name} failed:`, err)
		}
	}
}

export function startScheduler(): void {
	// A game going final is the moment its questions can settle, so the ones
	// this tick marked final are resolved in the same tick rather than waiting
	// for auto-resolve-games' own schedule below.
	cron.schedule(
		"*/5 * * * *",
		async () => {
			let wentFinal: string[] = []
			await runJob("sync-live-scores", async () => {
				wentFinal = await syncLiveScores()
			})()
			if (wentFinal.length === 0) return
			await runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames())()
			await drainAchievements()
		},
		{ name: "sync-live-scores", timezone: "UTC", noOverlap: true },
	)
	// Every minute, so a streak or sweep lands shortly after the result that
	// made it. Most ticks find the queue empty and do nothing.
	cron.schedule("* * * * *", drainAchievements, {
		name: RECOMPUTE_ACHIEVEMENTS_LOCK,
		timezone: "UTC",
		noOverlap: true,
	})
	// Daily, after the night's games have settled. Re-marks the last week's
	// tracks and slates for what no settle event covers - a flexed game moving
	// slot, ESPN correcting when a game went final - and the minute drain
	// rebuilds them.
	cron.schedule(
		"30 11 * * *",
		runJob("reconcile-achievements", async () => {
			await enqueueAchievementRecomputes({
				since: new Date(
					Date.now() - RECONCILE_ACHIEVEMENTS_DAYS * 24 * 60 * 60 * 1000,
				),
			})
		}),
		{ name: "reconcile-achievements", timezone: "UTC", noOverlap: true },
	)
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
	// Every 30m, but most ticks fetch little or nothing: each game is only due
	// again once its own refresh interval has passed (see isStartersRefreshDue).
	// Generation runs straight after, so the starters it picks subjects from
	// are the ones this tick just refreshed. Most of its runs insert nothing
	// (see generateGameQuestions).
	cron.schedule(
		"*/30 * * * *",
		async () => {
			await runJob("sync-game-starters", () => syncGameStarters())()
			await runJob("generate-game-questions", () => generateGameQuestions())()
		},
		{ name: "sync-game-starters", timezone: "UTC", noOverlap: true },
	)
	// Retries, re-checks, and games the daily sync marked final. A question is
	// only read again once its retry or its re-check comes due (see
	// db/sync/auto-resolve-games.ts). Offset from sync-live-scores' */5 so a
	// run here isn't holding the lock when that tick settles a game that just
	// went final.
	cron.schedule(
		"2-59/10 * * * *",
		runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames()),
		{ name: AUTO_RESOLVE_GAMES_LOCK, timezone: "UTC", noOverlap: true },
	)
	// Daily, after sync-sports-data has brought the season's games up to date.
	// A season is only read once its regular season is over (see
	// isSeasonResolutionDue), so most days this fetches nothing.
	cron.schedule(
		"30 10 * * *",
		runJob("auto-resolve-seasons", () => autoResolveSeasons()),
		{ name: "auto-resolve-seasons", timezone: "UTC", noOverlap: true },
	)
	// Daily. Reads nothing for a season whose postseason hasn't started, and
	// settles each championship once ESPN shows its deciding round finished.
	cron.schedule(
		"45 10 * * *",
		runJob("auto-resolve-championships", () => autoResolveChampionships()),
		{ name: "auto-resolve-championships", timezone: "UTC", noOverlap: true },
	)
	// Daily, after the night's games have resolved. Most days most templates
	// don't move: each one waits for enough resolved lines, and a shade already
	// where its results point stays put (see tuneLines).
	cron.schedule(
		"0 11 * * *",
		runJob("tune-lines", async () => {
			await tuneLines()
		}),
		{ name: "tune-lines", timezone: "UTC", noOverlap: true },
	)
	// Every 5m, but a user's results only go out once their calls on the day's
	// games have all settled, or at the 13:00 UTC backstop (see
	// DAY_START_HOUR_UTC) - the frequency is how quickly a finished day goes
	// out, not how often anyone gets mailed.
	cron.schedule(
		"*/5 * * * *",
		runJob(DRAIN_DIGESTS_LOCK, async () => {
			await drainResolutionDigests()
		}),
		{ name: DRAIN_DIGESTS_LOCK, timezone: "UTC", noOverlap: true },
	)
	// 13:00 UTC is 9am Eastern, the hour this list is most likely to be read,
	// and the only reason the enqueue has a time of day at all: rows appear only
	// when it runs, and the drain sends them within five minutes. Daily rather
	// than once per season because the announcement window is a range (see
	// LEAD_DAYS) - each day re-asks which seasons are close enough, and the
	// (user_id, season_id) primary key makes every rerun after the first a
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
		"[scheduler] started: sync-live-scores */5m (then auto-resolve-games and recompute-achievements when a game went final), recompute-achievements */1m, reconcile-achievements daily 11:30 UTC, lock-overdue-questions */15m, sync-sports-data daily 09:00 UTC, sync-game-starters then generate-game-questions */30m, auto-resolve-games 2-59/10m, auto-resolve-seasons daily 10:30 UTC, auto-resolve-championships daily 10:45 UTC, tune-lines daily 11:00 UTC, drain-email-digests */5m, enqueue-season-start-emails daily 13:00 UTC, drain-season-start-emails */5m",
	)
}

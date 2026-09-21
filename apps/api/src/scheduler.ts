import cron from "node-cron"
import { lockOverdueQuestions } from "./db/lock-overdue-questions"
import { autoResolveChampionships } from "./db/sync/auto-resolve-championships"
import { autoResolveGames } from "./db/sync/auto-resolve-games"
import { autoResolveSeasons } from "./db/sync/auto-resolve-seasons"
import { generateGameQuestions } from "./db/sync/generate-game-questions"
import { syncSportsData } from "./db/sync/run"
import { syncBoxScores } from "./db/sync/sync-box-scores"
import { syncGameStarters } from "./db/sync/sync-game-starters"
import { syncLiveScores } from "./db/sync/sync-live-scores"
import { drainAnalyticsOutbox } from "./lib/analytics-outbox"
import { drainResolutionDigests } from "./lib/email-digest"
import { tuneBands } from "./lib/game-questions/tune-bands"
import { tuneLeaderLosses } from "./lib/game-questions/tune-leader-losses"
import { tuneLines } from "./lib/game-questions/tune-lines"
import { tuneTitleLosses } from "./lib/game-questions/tune-title-losses"
import { drainGameReminders } from "./lib/game-reminders"
import {
	AUTO_RESOLVE_CHAMPIONSHIPS_LOCK,
	AUTO_RESOLVE_GAMES_LOCK,
	AUTO_RESOLVE_SEASONS_LOCK,
	BOX_SCORE_SYNC_LOCK,
	DRAIN_ANALYTICS_LOCK,
	DRAIN_DIGESTS_LOCK,
	DRAIN_GAME_REMINDERS_LOCK,
	DRAIN_SEASON_START_LOCK,
	ENQUEUE_SEASON_START_LOCK,
	GENERATE_GAME_QUESTIONS_LOCK,
	LOCK_OVERDUE_QUESTIONS_LOCK,
	RECOMPUTE_ACHIEVEMENTS_LOCK,
	RECONCILE_ACHIEVEMENTS_LOCK,
	SYNC_GAME_STARTERS_LOCK,
	SYNC_LIVE_SCORES_LOCK,
	SYNC_SPORTS_DATA_LOCK,
	TUNE_BANDS_LOCK,
	TUNE_LEADER_LOSSES_LOCK,
	TUNE_LINES_LOCK,
	TUNE_TITLE_LOSSES_LOCK,
	withJobLock,
} from "./lib/job-lock"
import {
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./lib/season-start-email"
import { enqueueAchievementRecomputes } from "./lib/streaks/backfill"
import { drainAchievementRecomputes } from "./lib/streaks/drain"
import { DAY_MS } from "./lib/time"

const RECONCILE_ACHIEVEMENTS_DAYS = 7

// Every job runs under a lease named after it, so a tick that fires on all
// machines at once still runs the job exactly once across the fleet - see
// lib/job-lock.ts. The CLI scripts take the same locks by name, which is
// what keeps a drain run by hand from racing a tick.
function runJob(name: string, fn: () => Promise<unknown>) {
	return async () => {
		try {
			const { ran } = await withJobLock(name, async () => {
				await fn()
			})
			if (!ran) console.log(`[scheduler] ${name} skipped - held elsewhere`)
		} catch (err) {
			console.error(`[scheduler] ${name} failed:`, err)
		}
	}
}

const drainAchievements = runJob(
	RECOMPUTE_ACHIEVEMENTS_LOCK,
	drainAchievementRecomputes,
)

export type ScheduledJob = {
	// The cron task's name, and the lease name for a job that is one step.
	name: string
	// Always read in UTC.
	cron: string
	run: () => Promise<void>
	// What else the tick runs, for the startup log.
	chains?: string
}

// A job that runs one step under its own lease.
const job = (
	name: string,
	cron: string,
	fn: () => Promise<unknown>,
): ScheduledJob => ({ name, cron, run: runJob(name, fn) })

export const JOBS: ScheduledJob[] = [
	// A game going final is the moment its questions can settle, so the ones
	// this tick marked final are resolved in the same tick rather than waiting
	// for auto-resolve-games' own schedule below.
	{
		name: SYNC_LIVE_SCORES_LOCK,
		cron: "*/5 * * * *",
		chains:
			"auto-resolve-games, recompute-achievements and sync-box-scores when a game went final",
		run: async () => {
			let wentFinal: string[] = []
			await runJob(SYNC_LIVE_SCORES_LOCK, async () => {
				wentFinal = await syncLiveScores()
			})()
			if (wentFinal.length === 0) return
			await runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames())()
			await drainAchievements()
			// After resolution, not before: auto-resolve-games stores the box
			// score of every game it fetched, so by now this usually finds
			// nothing to do. What it picks up is the games that path never
			// touches - see syncBoxScores.
			await runJob(BOX_SCORE_SYNC_LOCK, () => syncBoxScores())()
		},
	},
	// Every minute, so a streak or sweep lands shortly after the result that
	// made it. Most ticks find the queue empty and do nothing.
	{
		name: RECOMPUTE_ACHIEVEMENTS_LOCK,
		cron: "* * * * *",
		run: drainAchievements,
	},
	// Daily, after the night's games have settled. Re-marks the last week's
	// tracks and slates for what no settle event covers - a flexed game moving
	// slot, ESPN correcting when a game went final - and the minute drain
	// rebuilds them.
	job(RECONCILE_ACHIEVEMENTS_LOCK, "30 11 * * *", () =>
		enqueueAchievementRecomputes({
			since: new Date(Date.now() - RECONCILE_ACHIEVEMENTS_DAYS * DAY_MS),
		}),
	),
	job(LOCK_OVERDUE_QUESTIONS_LOCK, "*/15 * * * *", () =>
		lockOverdueQuestions(),
	),
	job(SYNC_SPORTS_DATA_LOCK, "0 9 * * *", () => syncSportsData()),
	// Every 30m, but most ticks fetch little or nothing: each game is only due
	// again once its own refresh interval has passed (see isStartersRefreshDue).
	// Generation runs straight after, so the starters it picks subjects from
	// are the ones this tick just refreshed. Most of its runs insert nothing
	// (see generateGameQuestions).
	{
		name: SYNC_GAME_STARTERS_LOCK,
		cron: "*/30 * * * *",
		chains: "generate-game-questions",
		run: async () => {
			await runJob(SYNC_GAME_STARTERS_LOCK, () => syncGameStarters())()
			await runJob(GENERATE_GAME_QUESTIONS_LOCK, () =>
				generateGameQuestions(),
			)()
		},
	},
	// Retries, re-checks, and games the daily sync marked final. A question is
	// only read again once its retry or its re-check comes due (see
	// db/sync/auto-resolve-games.ts). Offset from sync-live-scores' */5 so a
	// run here isn't holding the lock when that tick settles a game that just
	// went final.
	job(AUTO_RESOLVE_GAMES_LOCK, "2-59/10 * * * *", () => autoResolveGames()),
	// Daily, after sync-sports-data has brought the season's games up to date.
	// A season is only read once its regular season is over (see
	// isSeasonResolutionDue), so most days this fetches nothing.
	job(AUTO_RESOLVE_SEASONS_LOCK, "30 10 * * *", () => autoResolveSeasons()),
	// Daily. Reads nothing for a season whose postseason hasn't started, and
	// settles each championship once ESPN shows its deciding round finished.
	job(AUTO_RESOLVE_CHAMPIONSHIPS_LOCK, "45 10 * * *", () =>
		autoResolveChampionships(),
	),
	// Daily, after the night's games have resolved. Most days most templates
	// don't move: each one waits for enough resolved lines, and a shade already
	// where its results point stays put (see tuneLines).
	job(TUNE_LINES_LOCK, "0 11 * * *", () => tuneLines()),
	// Daily, after the night's games have gone final. Each band waits for
	// enough final scores, and one already where they point stays put (see
	// tuneBands).
	job(TUNE_BANDS_LOCK, "5 11 * * *", () => tuneBands()),
	// Daily, after the night's leader questions have resolved. Each rate waits
	// for enough resolved questions, and one already where they point stays
	// put (see tuneLeaderLosses).
	job(TUNE_LEADER_LOSSES_LOCK, "10 11 * * *", () => tuneLeaderLosses()),
	// Daily, though a title only resolves a few times a year - most runs move
	// nothing (see tuneTitleLosses).
	job(TUNE_TITLE_LOSSES_LOCK, "15 11 * * *", () => tuneTitleLosses()),
	// Every 5m, but a user's results only go out once their calls on the day's
	// games have all settled, or at the 13:00 UTC backstop (see
	// DAY_START_HOUR_UTC) - the frequency is how quickly a finished day goes
	// out, not how often anyone gets mailed.
	job(DRAIN_DIGESTS_LOCK, "*/5 * * * *", () => drainResolutionDigests()),
	// Every 5m, so a reminder lands between 60 and 55 minutes before its game.
	// Games starting close together go out as one email - see
	// BATCH_WINDOW_MINUTES in lib/game-reminders.tsx.
	job(DRAIN_GAME_REMINDERS_LOCK, "*/5 * * * *", () => drainGameReminders()),
	// 13:00 UTC is 9am Eastern, the hour this list is most likely to be read,
	// and the only reason the enqueue has a time of day at all: rows appear only
	// when it runs, and the drain sends them within five minutes. Daily rather
	// than once per season because the announcement window is a range (see
	// LEAD_DAYS) - each day re-asks which seasons are close enough, and the
	// (user_id, season_id) primary key makes every rerun after the first a
	// no-op for the same people.
	job(ENQUEUE_SEASON_START_LOCK, "0 13 * * *", () =>
		enqueueSeasonStartEmails({ commit: true }),
	),
	// Separate from the enqueue so one pass doesn't have to hand Resend the
	// whole user list in one go - each tick takes a capped batch, and a list
	// bigger than the cap spreads over the following ticks instead of
	// spiking a shared sending domain.
	job(DRAIN_SEASON_START_LOCK, "*/5 * * * *", () => drainSeasonStartEmails()),
	// Every minute, so a server-side event lands in PostHog close to when it
	// happened. Most ticks find nothing queued.
	job(DRAIN_ANALYTICS_LOCK, "* * * * *", () => drainAnalyticsOutbox()),
]

export function startScheduler(): void {
	for (const { name, cron: expression, run } of JOBS) {
		cron.schedule(expression, run, { name, timezone: "UTC", noOverlap: true })
	}
	console.log(
		`[scheduler] started (UTC): ${JOBS.map(
			(j) => `${j.name} "${j.cron}"${j.chains ? ` then ${j.chains}` : ""}`,
		).join(", ")}`,
	)
}

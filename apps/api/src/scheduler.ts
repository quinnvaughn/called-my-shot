import cron from "node-cron"
import { lockOverdueQuestions } from "./db/lock-overdue-questions"
import { autoResolveChampionships } from "./db/sync/auto-resolve-championships"
import { autoResolveGames } from "./db/sync/auto-resolve-games"
import { autoResolveSeasons } from "./db/sync/auto-resolve-seasons"
import { generateGameQuestions } from "./db/sync/generate-game-questions"
import { syncSportsData } from "./db/sync/run"
import { syncBoxScores } from "./db/sync/sync-box-scores"
import { syncGameStarters } from "./db/sync/sync-game-starters"
import { syncLiveReadings } from "./db/sync/sync-live-readings"
import { syncLiveScores } from "./db/sync/sync-live-scores"
import { drainAnalyticsOutbox } from "./lib/analytics-outbox"
import { drainResolutionDigests, SETTLE_MINUTES } from "./lib/email-digest"
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
	SYNC_LIVE_READINGS_LOCK,
	SYNC_LIVE_SCORES_LOCK,
	SYNC_SPORTS_DATA_LOCK,
	TUNE_BANDS_LOCK,
	TUNE_LEADER_LOSSES_LOCK,
	TUNE_LINES_LOCK,
	TUNE_TITLE_LOSSES_LOCK,
	withJobLock,
} from "./lib/job-lock"
import { markPending, takePending } from "./lib/pending-work"
import {
	drainSeasonStartEmails,
	enqueueSeasonStartEmails,
} from "./lib/season-start-email"
import { enqueueAchievementRecomputes } from "./lib/streaks/backfill"
import { drainAchievementRecomputes } from "./lib/streaks/drain"
import { DAY_MS, MINUTE_MS } from "./lib/time"
import { refreshWorkCalendar, workCalendar } from "./lib/work-calendar"

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
	// Checked before anything else on each tick, from memory only - a tick it
	// turns away never touches the database. Neon suspends the compute after
	// minutes without a query, so a job that asked the database whether it
	// had work every minute would keep it awake around the clock. Omitted for
	// a job that runs on every tick.
	when?: (now: Date) => boolean
	run: () => Promise<void>
	// What else the tick runs, for the startup log.
	chains?: string
}

// A job that runs one step under its own lease.
const job = (
	name: string,
	cron: string,
	fn: () => Promise<unknown>,
	when?: (now: Date) => boolean,
): ScheduledJob => ({ name, cron, when, run: runJob(name, fn) })

const { inGameWindow } = workCalendar

const syncLiveScoresTick = async () => {
	let wentFinal: string[] = []
	await runJob(SYNC_LIVE_SCORES_LOCK, async () => {
		wentFinal = await syncLiveScores()
	})()
	if (wentFinal.length > 0) {
		await runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames())()
		await drainAchievements()
		// After resolution, not before: auto-resolve-games stores the box
		// score of every game it fetched, so by now this usually finds
		// nothing to do. What it picks up is the games that path never
		// touches - see syncBoxScores.
		await runJob(BOX_SCORE_SYNC_LOCK, () => syncBoxScores())()
	}
	await runJob(SYNC_LIVE_READINGS_LOCK, () => syncLiveReadings())()
}

// Streaks and sweeps are rebuilt after whatever settled the questions they
// count, not on a clock of their own: a few minutes late is fine, and a
// question settled outside these (an admin's resolve or void) waits for the
// next of them.
const autoResolveGamesTick = async () => {
	await runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames())()
	await drainAchievements()
}

const syncStartersTick = async () => {
	await runJob(SYNC_GAME_STARTERS_LOCK, () => syncGameStarters())()
	await runJob(GENERATE_GAME_QUESTIONS_LOCK, () => generateGameQuestions())()
}

// One capped batch. A batch that took anything means there may be more, so
// the next */5 tick looks again.
const drainSeasonStartBatch = async () => {
	const { sent, skipped, failed } = await drainSeasonStartEmails()
	if (sent + skipped + failed > 0) markPending("season-start")
}

export const JOBS: ScheduledJob[] = [
	// A game going final is the moment its questions can settle, so the ones
	// this tick marked final are resolved in the same tick rather than waiting
	// for auto-resolve-games' own schedule below. Live readings come last, off
	// the statuses this tick just wrote, since a result matters more than a
	// game in progress. Only while a game is near or in progress - see
	// inGameWindow in lib/work-calendar.ts.
	{
		name: SYNC_LIVE_SCORES_LOCK,
		cron: "*/5 * * * *",
		when: inGameWindow,
		chains:
			"auto-resolve-games, recompute-achievements and sync-box-scores when a game went final, then sync-live-readings",
		run: async () => {
			await syncLiveScoresTick()
			await refreshWorkCalendar()
		},
	},
	// Each game is only due again once its own refresh interval has passed (see
	// isStartersRefreshDue), and the tick only runs when one is. Generation
	// runs straight after, so the starters it picks subjects from are the ones
	// this tick just refreshed. Most of its runs insert nothing (see
	// generateGameQuestions). Every tick inside a game window too, since the
	// database is awake for it then anyway. Both checks are made so the
	// starters gate notes what it found due either way.
	{
		name: SYNC_GAME_STARTERS_LOCK,
		cron: "*/30 * * * *",
		when: (now) => {
			const startersDue = workCalendar.takeStartersDue(now)
			return inGameWindow(now) || startersDue
		},
		chains: "generate-game-questions",
		run: async () => {
			await syncStartersTick()
			await refreshWorkCalendar()
		},
	},
	// Retries, re-checks, and games the daily sync marked final. A question is
	// only read again once its retry or its re-check comes due (see
	// db/sync/auto-resolve-games.ts). Offset from sync-live-scores' */5 so a
	// run here isn't holding the lock when that tick settles a game that just
	// went final. Outside a game window it runs only on the first tick of the
	// hour that something is due, so a retry that keeps failing costs one wake
	// an hour rather than keeping the database up.
	{
		name: AUTO_RESOLVE_GAMES_LOCK,
		cron: "2-59/10 * * * *",
		when: (now) =>
			inGameWindow(now) ||
			(now.getUTCMinutes() < 10 && workCalendar.isAutoResolveDue(now)),
		chains: "recompute-achievements",
		run: async () => {
			await autoResolveGamesTick()
			await refreshWorkCalendar()
		},
	},
	// The status column only - nothing enforces off it (see
	// lockOverdueQuestions) - so it's kept tidy while games are being played
	// and by the morning sweep the rest of the time.
	job(
		LOCK_OVERDUE_QUESTIONS_LOCK,
		"*/15 * * * *",
		() => lockOverdueQuestions(),
		inGameWindow,
	),
	// A user's results only go out once their calls on the day's games have
	// all settled, or at the 13:00 UTC backstop in daily-mail-sweep (see
	// DAY_START_HOUR_UTC) - the frequency is how quickly a finished day goes
	// out, not how often anyone gets mailed. Results settle in game windows,
	// and one settled outside them (a creator grading their own question)
	// opens the gate once its rows have sat SETTLE_MINUTES.
	job(
		DRAIN_DIGESTS_LOCK,
		"*/5 * * * *",
		() => drainResolutionDigests(),
		(now) =>
			takePending("digests", now, SETTLE_MINUTES * MINUTE_MS) ||
			inGameWindow(now),
	),
	// Every 5m, so a reminder lands between 60 and 55 minutes before its game,
	// which inGameWindow opens early enough to cover. Games starting close
	// together go out as one email - see BATCH_WINDOW_MINUTES in
	// lib/game-reminders.tsx.
	job(
		DRAIN_GAME_REMINDERS_LOCK,
		"*/5 * * * *",
		() => drainGameReminders(),
		inGameWindow,
	),
	// Separate from the enqueue so one pass doesn't have to hand Resend the
	// whole user list in one go - each tick takes a capped batch, and a list
	// bigger than the cap spreads over the following ticks instead of
	// spiking a shared sending domain.
	job(DRAIN_SEASON_START_LOCK, "*/5 * * * *", drainSeasonStartBatch, (now) =>
		takePending("season-start", now),
	),
	// Every minute that something was queued on this machine, so a
	// server-side event lands in PostHog close to when it happened. A tick
	// that sent anything looks again on the next one, for a backlog bigger
	// than one batch.
	job(
		DRAIN_ANALYTICS_LOCK,
		"* * * * *",
		async () => {
			const { sent } = await drainAnalyticsOutbox()
			if (sent > 0) markPending("analytics")
		},
		(now) => takePending("analytics", now),
	),
	// Everything that runs once a day, as one chain so the database wakes for
	// it once. 09:00 UTC is after the night's games have settled. The sports
	// sync comes first, so what follows reads today's games; auto-resolve
	// settles any game the sync marked final before the tune jobs read results
	// and the reconcile re-marks the last week's tracks and slates for what no
	// settle event covers - a flexed game moving slot, ESPN correcting when a
	// game went final. Each step keeps its own lease, and one failing doesn't
	// stop the rest. Also where auto-resolve, lock-overdue and starters catch
	// up on anything their gates kept them from.
	{
		name: "daily-sync-sweep",
		cron: "0 9 * * *",
		chains: [
			SYNC_SPORTS_DATA_LOCK,
			AUTO_RESOLVE_GAMES_LOCK,
			AUTO_RESOLVE_SEASONS_LOCK,
			AUTO_RESOLVE_CHAMPIONSHIPS_LOCK,
			TUNE_LINES_LOCK,
			TUNE_BANDS_LOCK,
			TUNE_LEADER_LOSSES_LOCK,
			TUNE_TITLE_LOSSES_LOCK,
			RECONCILE_ACHIEVEMENTS_LOCK,
			RECOMPUTE_ACHIEVEMENTS_LOCK,
			LOCK_OVERDUE_QUESTIONS_LOCK,
			SYNC_GAME_STARTERS_LOCK,
			GENERATE_GAME_QUESTIONS_LOCK,
		].join(", "),
		run: async () => {
			await runJob(SYNC_SPORTS_DATA_LOCK, () => syncSportsData())()
			await runJob(AUTO_RESOLVE_GAMES_LOCK, () => autoResolveGames())()
			// A season is only read once its regular season is over (see
			// isSeasonResolutionDue), so most days this fetches nothing.
			await runJob(AUTO_RESOLVE_SEASONS_LOCK, () => autoResolveSeasons())()
			// Reads nothing for a season whose postseason hasn't started, and
			// settles each championship once ESPN shows its deciding round
			// finished.
			await runJob(AUTO_RESOLVE_CHAMPIONSHIPS_LOCK, () =>
				autoResolveChampionships(),
			)()
			// Most days most of these don't move: each waits for enough
			// resolved results, and one already where they point stays put
			// (see tuneLines).
			await runJob(TUNE_LINES_LOCK, () => tuneLines())()
			await runJob(TUNE_BANDS_LOCK, () => tuneBands())()
			await runJob(TUNE_LEADER_LOSSES_LOCK, () => tuneLeaderLosses())()
			await runJob(TUNE_TITLE_LOSSES_LOCK, () => tuneTitleLosses())()
			await runJob(RECONCILE_ACHIEVEMENTS_LOCK, () =>
				enqueueAchievementRecomputes({
					since: new Date(Date.now() - RECONCILE_ACHIEVEMENTS_DAYS * DAY_MS),
				}),
			)()
			await drainAchievements()
			await runJob(LOCK_OVERDUE_QUESTIONS_LOCK, () => lockOverdueQuestions())()
			await syncStartersTick()
			await refreshWorkCalendar()
		},
	},
	// The mail that has a time of day. 13:00 UTC is 9am Eastern, the hour the
	// season-start list is most likely to be read, and the digest backstop
	// (DAY_START_HOUR_UTC) - anything still waiting goes out now. The
	// season-start enqueue is daily rather than once per season because the
	// announcement window is a range (see LEAD_DAYS): each day re-asks which
	// seasons are close enough, and the (user_id, season_id) primary key makes
	// every rerun after the first a no-op for the same people. Its drain takes
	// one capped batch here and the rest on the */5 ticks above. The other
	// drains are the backstop for rows their gates never saw.
	{
		name: "daily-mail-sweep",
		cron: "0 13 * * *",
		chains: [
			ENQUEUE_SEASON_START_LOCK,
			DRAIN_SEASON_START_LOCK,
			DRAIN_DIGESTS_LOCK,
			DRAIN_GAME_REMINDERS_LOCK,
			DRAIN_ANALYTICS_LOCK,
		].join(", "),
		run: async () => {
			await runJob(ENQUEUE_SEASON_START_LOCK, () =>
				enqueueSeasonStartEmails({ commit: true }),
			)()
			await runJob(DRAIN_SEASON_START_LOCK, drainSeasonStartBatch)()
			await runJob(DRAIN_DIGESTS_LOCK, () => drainResolutionDigests())()
			await runJob(DRAIN_GAME_REMINDERS_LOCK, () => drainGameReminders())()
			await runJob(DRAIN_ANALYTICS_LOCK, () => drainAnalyticsOutbox())()
			await refreshWorkCalendar()
		},
	},
]

export function startScheduler(): void {
	void refreshWorkCalendar()
	// Logged when a gate changes, not on every tick it turns away.
	const gateOpen = new Map<string, boolean>()
	for (const { name, cron: expression, when, run } of JOBS) {
		const tick = async () => {
			if (when) {
				const open = when(new Date())
				if (gateOpen.get(name) !== open) {
					console.log(`[scheduler] ${name} gate ${open ? "open" : "closed"}`)
					gateOpen.set(name, open)
				}
				if (!open) return
			}
			await run()
		}
		cron.schedule(expression, tick, {
			name,
			timezone: "UTC",
			noOverlap: true,
		})
	}
	console.log(
		`[scheduler] started (UTC): ${JOBS.map(
			(j) => `${j.name} "${j.cron}"${j.chains ? ` then ${j.chains}` : ""}`,
		).join(", ")}`,
	)
}

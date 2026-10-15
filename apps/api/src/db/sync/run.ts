import { SYNC_SPORTS_DATA_LOCK } from "../../lib/job-lock"
import { runCli } from "../../lib/run-cli"
import { getCurrentSeason } from "../../lib/seasons"
import { defaultEspnClient, type EspnClient } from "./espn-client"
import { SYNCED_LEAGUES } from "./leagues"
import { syncGameQuestions } from "./sync-game-questions"
import { syncGames } from "./sync-games"
import { syncPlayers } from "./sync-players"
import { syncSeasonQuestions } from "./sync-season-questions"
import { syncSeasons } from "./sync-seasons"
import { syncSeriesQuestions } from "./sync-series-questions"
import { syncTeams } from "./sync-teams"
import { syncTeamSeasonStats } from "./sync-team-season-stats"

// Each step runs on its own: one that throws is logged and the run moves on,
// so a bad ESPN response in one step doesn't cost every step after it - most
// of all the game and series questions, which work from whatever games did
// sync. The run still fails at the end, naming every step that did.
export async function syncSportsData({
	now = new Date(),
	espn = defaultEspnClient,
}: {
	now?: Date
	espn?: EspnClient
} = {}): Promise<void> {
	const failed: string[] = []
	const step = async <T>(
		name: string,
		fn: () => Promise<T>,
	): Promise<T | undefined> => {
		console.log(`[sync] ${name}...`)
		try {
			return await fn()
		} catch (err) {
			console.error(`[sync] ${name} failed:`, err)
			failed.push(name)
			return undefined
		}
	}

	for (const config of SYNCED_LEAGUES) {
		const name = config.leagueName
		// Every later step hangs off the league row this returns.
		const league = await step(`${name} teams`, () => syncTeams(config, espn))
		if (!league) continue

		// Seasons before players: a league's resolveRookieEligible hook (MLB)
		// needs to know the current season's year to tell which prior seasons'
		// stats count toward rookie eligibility - see syncPlayers.
		await step(`${name} seasons`, () =>
			syncSeasons(config, league, { now, espn }),
		)

		const currentSeason = await getCurrentSeason(league.id)
		await step(`${name} players`, () =>
			syncPlayers(config, currentSeason?.year ?? now.getFullYear(), espn),
		)

		await step(`${name} games`, () => syncGames(config, league, { now, espn }))

		// One dated reading of ESPN's standings per run. After syncGames so the
		// teams it may have just created are there to hang a row off, and
		// deliberately additive rather than an update in place: the matchup card
		// reads the last reading taken before a question locked, which a single
		// current row could never answer. Skipped between seasons, when there is
		// no current season to attribute a reading to.
		if (currentSeason) {
			await step(`${name} team season stats`, () =>
				syncTeamSeasonStats(config, league, currentSeason, { now, espn }),
			)
		}

		// After syncGames, per its own doc comment - each synced game gets its
		// team_vs_team "who will win?" question, which is what the game detail
		// page (/games/$gameId) surfaces as its hero question.
		await step(`${name} game questions`, () =>
			syncGameQuestions(league, now, espn),
		)

		// After syncGames too: a series only exists once its games have synced,
		// and its questions wait on Game 1's start time.
		await step(`${name} series questions`, () =>
			syncSeriesQuestions(league, now, espn),
		)

		// Idempotent per question (see syncSeasonQuestions) - safe to run
		// daily alongside everything above rather than needing its own
		// season-boundary-detection logic.
		await step(`${name} season questions`, () => syncSeasonQuestions(league))
	}

	if (failed.length > 0) {
		throw new Error(`[sync] finished with failures: ${failed.join(", ")}`)
	}
	console.log("[sync] done")
}

runCli(import.meta.url, syncSportsData, { lock: SYNC_SPORTS_DATA_LOCK })

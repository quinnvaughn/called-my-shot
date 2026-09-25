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

export async function syncSportsData({
	now = new Date(),
	espn = defaultEspnClient,
}: {
	now?: Date
	espn?: EspnClient
} = {}): Promise<void> {
	for (const config of SYNCED_LEAGUES) {
		console.log(`[sync] ${config.leagueName} teams...`)
		const league = await syncTeams(config, espn)

		// Seasons before players: a league's resolveRookieEligible hook (MLB)
		// needs to know the current season's year to tell which prior seasons'
		// stats count toward rookie eligibility - see syncPlayers.
		console.log(`[sync] ${config.leagueName} seasons...`)
		await syncSeasons(config, league, { now, espn })

		console.log(`[sync] ${config.leagueName} players...`)
		const currentSeason = await getCurrentSeason(league.id)
		await syncPlayers(config, currentSeason?.year ?? now.getFullYear(), espn)

		console.log(`[sync] ${config.leagueName} games...`)
		await syncGames(config, league, { now, espn })

		// One dated reading of ESPN's standings per run. After syncGames so the
		// teams it may have just created are there to hang a row off, and
		// deliberately additive rather than an update in place: the matchup card
		// reads the last reading taken before a question locked, which a single
		// current row could never answer. Skipped between seasons, when there is
		// no current season to attribute a reading to.
		if (currentSeason) {
			console.log(`[sync] ${config.leagueName} team season stats...`)
			await syncTeamSeasonStats(config, league, currentSeason, { now, espn })
		}

		// After syncGames, per its own doc comment - each synced game gets its
		// team_vs_team "who will win?" question, which is what the game detail
		// page (/games/$gameId) surfaces as its hero question.
		console.log(`[sync] ${config.leagueName} game questions...`)
		await syncGameQuestions(league, now)

		// After syncGames too: a series only exists once its games have synced,
		// and its questions wait on Game 1's start time.
		console.log(`[sync] ${config.leagueName} series questions...`)
		await syncSeriesQuestions(league, now)

		// Idempotent per question (see syncSeasonQuestions) - safe to run
		// daily alongside everything above rather than needing its own
		// season-boundary-detection logic.
		console.log(`[sync] ${config.leagueName} season questions...`)
		await syncSeasonQuestions(league)
	}
	console.log("[sync] done")
}

runCli(import.meta.url, syncSportsData, { lock: SYNC_SPORTS_DATA_LOCK })

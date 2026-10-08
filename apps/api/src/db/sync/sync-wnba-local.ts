import { runCli } from "../../lib/run-cli"
import { getCurrentSeason } from "../../lib/seasons"
import type { EspnSportPath } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { syncGameQuestions } from "./sync-game-questions"
import { syncGames } from "./sync-games"
import { syncSeasons } from "./sync-seasons"
import { syncSeriesQuestions } from "./sync-series-questions"
import { syncTeamSeasonStats } from "./sync-team-season-stats"
import { syncTeams } from "./sync-teams"

// Local preview only: pulls the WNBA's teams, seasons, games, standings and
// game/series questions from ESPN so the postseason pages can be seen with a
// real bracket. Players and stats are skipped, and WNBA isn't in
// SYNCED_LEAGUES, so none of the scheduled jobs touch it after this runs.
const WNBA: SyncLeagueConfig = {
	sportName: "Basketball",
	sportSlug: "basketball",
	leagueName: "WNBA",
	leagueAbbreviation: "WNBA",
	leagueSlug: "wnba",
	espnPath: "basketball/wnba" as EspnSportPath,
	seedsLeagueWide: true,
}

async function syncWnbaLocal() {
	const now = new Date()
	console.log("[wnba] teams...")
	const league = await syncTeams(WNBA)
	console.log("[wnba] seasons...")
	await syncSeasons(WNBA, league, { now })
	console.log("[wnba] games...")
	await syncGames(WNBA, league, { now })
	const season = await getCurrentSeason(league.id)
	if (season) {
		console.log("[wnba] standings...")
		await syncTeamSeasonStats(WNBA, league, season, { now })
	}
	console.log("[wnba] game questions...")
	await syncGameQuestions(league, now)
	console.log("[wnba] series questions...")
	await syncSeriesQuestions(league, now)
	console.log("[wnba] done")
}

runCli(import.meta.url, syncWnbaLocal)

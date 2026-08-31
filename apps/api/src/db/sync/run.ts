import { getCurrentSeason } from "../../lib/seasons"
import { SYNCED_LEAGUES } from "./leagues"
import { syncGameQuestions } from "./sync-game-questions"
import { syncGames } from "./sync-games"
import { syncPlayers } from "./sync-players"
import { syncSeasons } from "./sync-seasons"
import { syncTeams } from "./sync-teams"

async function main() {
	for (const config of SYNCED_LEAGUES) {
		console.log(`[sync] ${config.leagueName} teams...`)
		const league = await syncTeams(config)

		// Seasons before players: a league's resolveRookieEligible hook (MLB)
		// needs to know the current season's year to tell which prior seasons'
		// stats count toward rookie eligibility - see syncPlayers.
		console.log(`[sync] ${config.leagueName} seasons...`)
		await syncSeasons(config, league)

		console.log(`[sync] ${config.leagueName} players...`)
		const currentSeason = await getCurrentSeason(league.id)
		await syncPlayers(config, currentSeason?.year ?? new Date().getFullYear())

		console.log(`[sync] ${config.leagueName} games...`)
		await syncGames(config, league)

		// After syncGames, per its own doc comment - each synced game gets its
		// team_vs_team "who will win?" question, which is what the game detail
		// page (/games/$gameId) surfaces as its hero question.
		console.log(`[sync] ${config.leagueName} game questions...`)
		await syncGameQuestions(league)
	}
	console.log("[sync] done")
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})

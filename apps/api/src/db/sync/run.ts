import { getCurrentSeason } from "../../lib/seasons"
import { SYNCED_LEAGUES } from "./leagues"
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
	}
	console.log("[sync] done")
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})

import { SYNCED_LEAGUES } from "./leagues"
import { syncGames } from "./sync-games"
import { syncPlayers } from "./sync-players"
import { syncSeasons } from "./sync-seasons"
import { syncTeams } from "./sync-teams"

async function main() {
	for (const config of SYNCED_LEAGUES) {
		console.log(`[sync] ${config.leagueName} teams...`)
		const league = await syncTeams(config)

		console.log(`[sync] ${config.leagueName} players...`)
		await syncPlayers(config)

		console.log(`[sync] ${config.leagueName} seasons...`)
		await syncSeasons(config, league)

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

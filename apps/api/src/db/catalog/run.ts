import { syncFlairCatalog } from "./flairs"
import { syncStatCatalog } from "./stats"

async function main() {
	console.log("[catalog] syncing stat catalog...")
	const { basketballStats, footballStats, baseballStats } =
		await syncStatCatalog()
	console.log(
		`[catalog] done - ${basketballStats.length} basketball stats, ${footballStats.length} football stats, ${baseballStats.length} baseball stats`,
	)

	console.log("[catalog] syncing flair catalog...")
	const flairs = await syncFlairCatalog()
	console.log(
		`[catalog] done - ${flairs.team} team flairs, ${flairs.achievement} achievement flairs`,
	)
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})

import { runCli } from "../../lib/run-cli"
import { syncFlairCatalog } from "./flairs"
import { syncRushmorePromptCatalog } from "./rushmore-prompts"
import { syncStatCatalog } from "./stats"

async function main() {
	console.log("[catalog] syncing stat catalog...")
	const { basketballStats, footballStats, baseballStats, hockeyStats } =
		await syncStatCatalog()
	console.log(
		`[catalog] done - ${basketballStats.length} basketball stats, ${footballStats.length} football stats, ${baseballStats.length} baseball stats, ${hockeyStats.length} hockey stats`,
	)

	console.log("[catalog] syncing flair catalog...")
	const flairs = await syncFlairCatalog()
	console.log(
		`[catalog] done - ${flairs.team} team flairs, ${flairs.achievement} achievement flairs`,
	)

	console.log("[catalog] syncing Rushmore prompts...")
	const rushmorePrompts = await syncRushmorePromptCatalog()
	console.log(`[catalog] done - ${rushmorePrompts} franchise prompts`)
}

runCli(import.meta.url, main)

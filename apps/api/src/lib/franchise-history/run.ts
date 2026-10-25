import { parseArgs } from "node:util"
import { match } from "ts-pattern"
import { INGEST_HISTORY_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import {
	HISTORY_LEAGUES,
	type HistoryLeague,
	isHistoryLeague,
} from "./franchise-map"
import { loadMlbHistory } from "./mlb"
import { loadNbaHistory } from "./nba"
import { loadNflHistory } from "./nfl"
import { loadNhlHistory } from "./nhl"
import { refreshStintPositions } from "./positions"
import type { Log } from "./types"
import { describeResult, writeHistory } from "./write-stints"

// Reads every franchise's all-time players from each league's reference
// source and writes the Mount Rushmore pools (player_franchise_stints).
//
//   pnpm --filter api history:ingest
//   pnpm --filter api history:ingest -- --league=nba
//   pnpm --filter api history:ingest -- --positions-only
//
// Each league's stint positions are refreshed after its stints are written
// (see ./positions.ts). --positions-only does just that, without reading the
// sources again.
//
// A rerun is the update: it relinks by ref, adds whoever is new, refreshes
// every stint, and drops stints the source no longer gives. Run it after each
// league's season. Takes minutes, most of it the polite spacing toward
// Basketball-Reference and the ~4,500 MLB roster reads.

export async function ingestFranchiseHistory(
	leagues: readonly HistoryLeague[] = HISTORY_LEAGUES,
	log: Log = (line) => console.log(line),
	{ positionsOnly = false }: { positionsOnly?: boolean } = {},
): Promise<void> {
	for (const league of leagues) {
		if (positionsOnly) {
			await refreshStintPositions(league, log)
			continue
		}
		const players = await match(league)
			.with("nba", () => loadNbaHistory(log))
			.with("mlb", () => loadMlbHistory(log))
			.with("nhl", () => loadNhlHistory(log))
			.with("nfl", () => loadNflHistory(log))
			.exhaustive()
		log(describeResult(league, await writeHistory(league, players, log)))
		await refreshStintPositions(league, log)
	}
}

function argsFromCli(): {
	leagues: HistoryLeague[]
	positionsOnly: boolean
} {
	const { values } = parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options: {
			league: { type: "string" },
			"positions-only": { type: "boolean" },
		},
		strict: true,
	})
	return {
		leagues: leaguesFrom(values.league),
		positionsOnly: values["positions-only"] ?? false,
	}
}

function leaguesFrom(arg: string | undefined): HistoryLeague[] {
	if (!arg) return [...HISTORY_LEAGUES]
	const leagues = arg.split(",")
	const unknown = leagues.filter((league) => !isHistoryLeague(league))
	if (unknown.length > 0) {
		throw new Error(
			`Unknown league ${unknown.join(", ")}; expected ${HISTORY_LEAGUES.join(", ")}`,
		)
	}
	return leagues.filter(isHistoryLeague)
}

runCli(
	import.meta.url,
	() => {
		const { leagues, positionsOnly } = argsFromCli()
		return ingestFranchiseHistory(leagues, undefined, { positionsOnly })
	},
	{
		lock: INGEST_HISTORY_LOCK,
	},
)

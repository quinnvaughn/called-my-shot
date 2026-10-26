import { parseArgs } from "node:util"
import { match } from "ts-pattern"
import { syncRedraftPromptCatalog } from "../../db/catalog/redraft-prompts"
import {
	HISTORY_LEAGUES,
	type HistoryLeague,
	isHistoryLeague,
} from "../franchise-history/franchise-map"
import type { Log } from "../franchise-history/types"
import { INGEST_DRAFTS_LOCK } from "../job-lock"
import { runCli } from "../run-cli"
import { loadMlbDrafts } from "./mlb"
import { loadNbaDrafts } from "./nba"
import { loadNflDrafts } from "./nfl"
import { loadNhlDrafts } from "./nhl"
import { describeDraftResult, writeDrafts } from "./write-drafts"

// Reads every league's draft history and writes the classes redrafts are
// played over (draft_entries), then makes a redraft prompt for any class
// that's new.
//
//   pnpm --filter api drafts:ingest
//   pnpm --filter api drafts:ingest -- --league=nba
//
// Run it after history:ingest, whose players the picks link to, and again
// after each league's draft. A rerun replaces the league's entries. Takes a
// few minutes, nearly all of it the polite spacing toward
// Basketball-Reference.

export async function ingestDrafts(
	leagues: readonly HistoryLeague[] = HISTORY_LEAGUES,
	log: Log = (line) => console.log(line),
): Promise<void> {
	for (const league of leagues) {
		const picks = await match(league)
			.with("nba", () => loadNbaDrafts(log))
			.with("mlb", () => loadMlbDrafts(log))
			.with("nhl", () => loadNhlDrafts(log))
			.with("nfl", () => loadNflDrafts(log))
			.exhaustive()
		log(describeDraftResult(league, await writeDrafts(league, picks, log)))
	}
	log(`${await syncRedraftPromptCatalog()} draft class prompts`)
}

function leaguesFromCli(): HistoryLeague[] {
	const { values } = parseArgs({
		args: process.argv.slice(2).filter((arg) => arg !== "--"),
		options: { league: { type: "string" } },
		strict: true,
	})
	if (!values.league) return [...HISTORY_LEAGUES]
	const leagues = values.league.split(",")
	const unknown = leagues.filter((league) => !isHistoryLeague(league))
	if (unknown.length > 0) {
		throw new Error(
			`Unknown league ${unknown.join(", ")}; expected ${HISTORY_LEAGUES.join(", ")}`,
		)
	}
	return leagues.filter(isHistoryLeague)
}

runCli(import.meta.url, () => ingestDrafts(leaguesFromCli()), {
	lock: INGEST_DRAFTS_LOCK,
})

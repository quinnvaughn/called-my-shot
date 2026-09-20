import { isMainModule } from "../../lib/is-main-module"
import {
	type BackfillResult,
	backfillBoxScores,
	selectBackfillGames,
} from "./backfill-box-scores"
import { DEFAULT_ESPN_SPACING_MS } from "./espn-requester"

const DAY_MS = 24 * 60 * 60 * 1000

// How far back a tick looks for a game it never captured. Recent gaps are the
// sweep's job; anything older is history, which is what the backfill script is
// for (pnpm --filter api backfill:box-scores). Without this bound a game whose
// box score ESPN never completes would sit at the front of the queue forever,
// re-fetched every tick and crowding out newer games.
const LOOKBACK_DAYS = 7

// At most this many per tick, so a long gap is worked through over several
// ticks instead of one run holding the lock for an hour.
const GAMES_PER_RUN = 40

// Captures the box score of every recent final game that doesn't have one.
//
// Most games are already captured by the time this runs: auto-resolve-games
// fetches a summary to settle a question and persists it in passing. What this
// exists for is the games that path never sees. loadCandidates excludes
// team_vs_team (resolveGameWinner settles it off the scoreboard, so no box
// score is ever fetched), which means a game whose only question is the
// generated matchup one would otherwise never be captured at all. Generated
// player questions cover most games in practice, but only inside
// generate-game-questions' own window, so "most" is not "all".
export async function syncBoxScores(
	args: { now?: Date; limit?: number; spacingMs?: number } = {},
): Promise<BackfillResult & { pending: number }> {
	const now = args.now ?? new Date()
	const limit = args.limit ?? GAMES_PER_RUN

	const selection = await selectBackfillGames({
		from: new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
		limit,
	})

	if (selection.candidates.length === 0) {
		return {
			captured: 0,
			notFinal: 0,
			fetchFailed: 0,
			failed: 0,
			playerRows: 0,
			teamRows: 0,
			refusedAfter: null,
			pending: 0,
		}
	}

	const result = await backfillBoxScores({
		candidates: selection.candidates,
		now,
		spacingMs: args.spacingMs ?? DEFAULT_ESPN_SPACING_MS,
	})

	if (result.captured > 0) {
		console.log(
			`[sync-box-scores] captured ${result.captured} box score(s): ${result.playerRows} player row(s), ${result.teamRows} team row(s)`,
		)
	}

	return { ...result, pending: selection.candidates.length }
}

if (isMainModule(import.meta.url)) {
	syncBoxScores()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}

import {
	backfillBoxScores,
	BACKFILL_SPACING_MS,
	selectBackfillGames,
} from "../src/db/sync/backfill-box-scores"
import { BOX_SCORE_SYNC_LOCK, withJobLock } from "../src/lib/job-lock"
import { parseFlags } from "./parse-flags"

// Thin CLI over src/db/sync/backfill-box-scores.ts, which is where the
// behaviour and its tests live. Stores the box score of every final game that
// doesn't have one yet, which is what gives a game log enough depth to be
// worth showing.
//
//   pnpm --filter api backfill:box-scores                        # dry run
//   pnpm --filter api backfill:box-scores -- --commit
//   pnpm --filter api backfill:box-scores -- --league=mlb --commit
//   pnpm --filter api backfill:box-scores -- --season=2025 --limit=200 --commit
//   pnpm --filter api backfill:box-scores -- --from=2025-04-01 --to=2025-10-01 --commit
//   pnpm --filter api backfill:box-scores -- --league=mlb --restore-before=2026-09-29T20:00:00Z --commit
//
// --restore-before also stores again every game whose box score was stored
// before that time, for when the parser starts deriving a value that older
// rows don't have. Pass the same timestamp to resume one.
//
// Interrupting it is safe. Each game is stamped in the same transaction as its
// rows, so re-running the same command resumes rather than restarting.
const flags = parseFlags({
	commit: { type: "boolean", default: false },
	league: { type: "string" },
	season: { type: "string" },
	from: { type: "string" },
	to: { type: "string" },
	limit: { type: "string" },
	spacing: { type: "string" },
	"restore-before": { type: "string" },
})

function list(raw: string | undefined): string[] | undefined {
	if (!raw) return undefined
	return raw.split(",").filter(Boolean)
}

function date(name: "from" | "to" | "restore-before"): Date | undefined {
	const raw = flags[name]
	if (!raw) return undefined
	const parsed = new Date(raw)
	if (Number.isNaN(parsed.getTime())) {
		console.error(`--${name} isn't a date I can read: ${raw}`)
		process.exit(1)
	}
	return parsed
}

const commit = flags.commit
const limit = Number(flags.limit) || undefined
const spacingMs = Number(flags.spacing) || BACKFILL_SPACING_MS

const selection = await selectBackfillGames({
	leagueSlugs: list(flags.league),
	seasonYears: list(flags.season)?.map(Number).filter(Number.isFinite),
	from: date("from"),
	to: date("to"),
	restoreBefore: date("restore-before"),
	limit,
})

const total = selection.candidates.length
const byLeague = new Map<string, number>()
for (const candidate of selection.candidates) {
	byLeague.set(
		candidate.leagueSlug,
		(byLeague.get(candidate.leagueSlug) ?? 0) + 1,
	)
}

for (const [slug, count] of byLeague) {
	console.log(`  ${slug}: ${count} game(s) pending`)
}
if (selection.skippedNoEspnRef > 0) {
	console.log(
		`  ${selection.skippedNoEspnRef} game(s) skipped: no ESPN event to fetch`,
	)
}
if (selection.skippedUnsyncedLeague > 0) {
	console.log(
		`  ${selection.skippedUnsyncedLeague} game(s) skipped: league isn't synced`,
	)
}

if (total === 0) {
	console.log("Nothing to capture.")
	process.exit(0)
}

const minutes = Math.ceil((total * spacingMs) / 60_000)
if (!commit) {
	console.log(
		`Dry run, no ESPN requests made. ${total} request(s), roughly ${minutes} min at ${spacingMs}ms spacing.`,
	)
	console.log("Re-run with --commit.")
	process.exit(0)
}

console.log(`Capturing ${total} box score(s), roughly ${minutes} min.`)

const startedAt = Date.now()
let refused = false
const { ran } = await withJobLock(BOX_SCORE_SYNC_LOCK, async () => {
	const result = await backfillBoxScores({
		candidates: selection.candidates,
		now: new Date(),
		spacingMs,
		onProgress: (done, count) => {
			const elapsed = Math.round((Date.now() - startedAt) / 1000)
			console.log(`  ${done}/${count} after ${elapsed}s`)
		},
	})

	console.log(
		`Captured ${result.captured} game(s): ${result.playerRows} player row(s), ${result.teamRows} team row(s).`,
	)
	if (result.notFinal > 0) {
		console.log(
			`  ${result.notFinal} skipped: ESPN's box score isn't complete yet.`,
		)
	}
	if (result.fetchFailed > 0) {
		console.log(`  ${result.fetchFailed} skipped: couldn't fetch.`)
	}
	if (result.failed > 0) {
		console.log(`  ${result.failed} failed to store, logged above.`)
	}
	if (result.refusedAfter !== null) {
		refused = true
		console.error(
			`ESPN refused us after ${result.refusedAfter} game(s). Re-run the same command to pick up from there.`,
		)
	}
})

if (!ran) {
	console.log("A box score sync is already running. Try again shortly.")
	process.exit(1)
}
process.exit(refused ? 1 : 0)

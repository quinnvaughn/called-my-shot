import { archiveRankData } from "../src/lib/blind-rank/rank-archive"
import { ARCHIVE_RANK_LOCK, withJobLock } from "../src/lib/job-lock"
import { isSeasonLeague } from "../src/lib/season-puzzles/archive-parse"
import { parseFlags } from "./parse-flags"

// Thin CLI over src/lib/blind-rank/rank-archive.ts. Reads every finished
// season's stat leaders from ESPN, then the career totals of the players who
// led, Blind Rank's player pools.
//
//   pnpm --filter api rank:archive
//   pnpm --filter api rank:archive -- --league=nba --from=1996 --to=1996
//
// Interrupting it is safe: a season already archived is skipped, and so is
// a career already read, so the same command resumes.
const flags = parseFlags({
	league: { type: "string" },
	from: { type: "string" },
	to: { type: "string" },
	spacing: { type: "string" },
})

const leagues = flags.league?.split(",").filter(isSeasonLeague)

const { ran } = await withJobLock(ARCHIVE_RANK_LOCK, async () => {
	const result = await archiveRankData({
		leagues: leagues?.length ? leagues : undefined,
		from: Number(flags.from) || undefined,
		to: Number(flags.to) || undefined,
		spacingMs: Number(flags.spacing) || undefined,
		log: (line) => console.log(line),
	})
	console.log(
		`Archived leaders for ${result.seasons} seasons and ${result.careers} careers.`,
	)
})
if (!ran) console.log(`${ARCHIVE_RANK_LOCK} is running elsewhere, skipped`)
process.exit(0)

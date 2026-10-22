import { isSeasonLeague } from "../src/lib/season-puzzles/archive-parse"
import { archiveSeasons } from "../src/lib/season-puzzles/archive"
import { ARCHIVE_SEASONS_LOCK, withJobLock } from "../src/lib/job-lock"
import { parseFlags } from "./parse-flags"

// Thin CLI over src/lib/season-puzzles/archive.ts. Reads every finished
// season from ESPN into team_seasons, Name That Season's answer pool.
//
//   pnpm --filter api seasons:archive
//   pnpm --filter api seasons:archive -- --league=nfl,nba
//   pnpm --filter api seasons:archive -- --league=nba --from=1996 --to=1996 --refresh
//
// Interrupting it is safe: a season already archived is skipped, so the same
// command resumes. --refresh rewrites the seasons in range instead.
const flags = parseFlags({
	league: { type: "string" },
	from: { type: "string" },
	to: { type: "string" },
	refresh: { type: "boolean", default: false },
	spacing: { type: "string" },
})

const leagues = flags.league?.split(",").filter(isSeasonLeague)

const { ran } = await withJobLock(ARCHIVE_SEASONS_LOCK, async () => {
	const result = await archiveSeasons({
		leagues: leagues?.length ? leagues : undefined,
		from: Number(flags.from) || undefined,
		to: Number(flags.to) || undefined,
		refresh: flags.refresh,
		spacingMs: Number(flags.spacing) || undefined,
		log: (line) => console.log(line),
	})
	console.log(
		`Archived ${result.teamSeasons} team-seasons across ${result.seasons} seasons.`,
	)
})
if (!ran) console.log(`${ARCHIVE_SEASONS_LOCK} is running elsewhere, skipped`)
process.exit(0)

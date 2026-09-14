import { RECOMPUTE_ACHIEVEMENTS_LOCK, withJobLock } from "../src/lib/job-lock"
import { enqueueAchievementRecomputes } from "../src/lib/streaks/backfill"
import { drainAchievementRecomputes } from "../src/lib/streaks/drain"

// Thin CLI over lib/streaks/backfill.ts and lib/streaks/drain.ts, which is
// where the behaviour and its tests live. Rebuilds every streak and sweep
// from the calls already in the database, without notifying anyone.
//
//   pnpm --filter api backfill:streaks            # dry run: counts only
//   pnpm --filter api backfill:streaks -- --commit
function flag(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}`))
	if (!hit) return undefined
	return hit.includes("=") ? hit.split("=")[1] : "true"
}

const commit = flag("commit") === "true"

if (!commit) {
	console.log(
		"Dry run. Re-run with --commit to queue every track and slate and rebuild them now.",
	)
	process.exit(0)
}

// The same lock the scheduler's drain takes, so the backfill's rebuilds can't
// run alongside a tick's - and the tick can't pick these rows up with
// notifications on.
const { ran } = await withJobLock(RECOMPUTE_ACHIEVEMENTS_LOCK, async () => {
	const queued = await enqueueAchievementRecomputes({ since: null })
	console.log(`Queued ${queued.tracks} track(s) and ${queued.slates} slate(s).`)
	const drained = await drainAchievementRecomputes({ notify: false })
	console.log(
		`Rebuilt ${drained.tracks} track(s) and ${drained.slates} slate(s).`,
	)
})
if (!ran) {
	console.log("A scheduler drain is running. Try again in a minute.")
	process.exit(1)
}
process.exit(0)

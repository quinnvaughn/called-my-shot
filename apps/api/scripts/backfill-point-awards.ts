import { enqueueAchievementRecomputes } from "../src/lib/streaks/backfill"
import { drainAchievementRecomputes } from "../src/lib/streaks/drain"
import { RECOMPUTE_ACHIEVEMENTS_LOCK, withJobLock } from "../src/lib/job-lock"
import { parseFlags } from "./parse-flags"

// Fills point_awards for everything that happened before it existed: every
// streak milestone and sweep, by rebuilding every streak track and slate.
//
//   pnpm --filter api backfill:point-awards              # dry run
//   pnpm --filter api backfill:point-awards -- --commit
//
// Safe to re-run, and to interrupt. Every award is written by the same
// reconcile the live rebuilds use, which leaves a scope that's already right
// untouched. Rebuilds run with notifications off, so nobody is told about a
// streak from last month.
const flags = parseFlags({
	commit: { type: "boolean", default: false },
})

if (!flags.commit) {
	console.log("Dry run. Would rebuild every streak track and slate.")
	console.log("Re-run with --commit.")
	process.exit(0)
}

const { ran } = await withJobLock(RECOMPUTE_ACHIEVEMENTS_LOCK, async () => {
	const marked = await enqueueAchievementRecomputes({ since: null })
	console.log(
		`Marked ${marked.tracks} streak track(s) and ${marked.slates} slate(s).`,
	)

	// One drain call stops at its own per-run cap, so keep going until the
	// queue is empty.
	let tracks = 0
	let slates = 0
	for (;;) {
		const drained = await drainAchievementRecomputes({ notify: false })
		if (drained.tracks === 0 && drained.slates === 0) break
		tracks += drained.tracks
		slates += drained.slates
	}
	console.log(`Rebuilt ${tracks} streak track(s) and ${slates} slate(s).`)
})

if (!ran) {
	console.log("A streak rebuild is already running. Try again shortly.")
	process.exit(1)
}
process.exit(0)

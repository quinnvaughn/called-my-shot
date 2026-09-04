import { and, eq, inArray } from "drizzle-orm"
import { isMainModule } from "../../lib/is-main-module"
import { db } from "../index"
import { questions } from "../schema"

// One-off, deliberately not wired into any sync or scheduler. Win totals lock
// at the season's first game on purpose (see winTotalLocksAt in
// lib/season-questions.ts) - a win total stops being a prediction once games
// are banked, and that stays the rule for every future season. This script
// exists to hand back a window for one season only, where the app itself went
// live too close to kickoff for anyone to have called them.
//
// The extension is a fraction of the season's own length rather than a fixed
// date, so it lands in the same place regardless of how long the league's
// schedule runs - a quarter of the way in, where the earliness multiplier
// still pays 1.94x against a preseason call's 3x (seasonEarlyTierFor in
// packages/scoring) and roughly four NFL games have been played.
const WINDOW_FRACTION = 0.25

// locksAt is written once at creation (createQuestion) and no mutation edits
// it afterward, which is why this has to touch rows directly rather than going
// through the API.
export async function extendWinTotalLocks(params: {
	leagueSlugs: string[]
	apply: boolean
}): Promise<void> {
	const leagues = await db.query.leagues.findMany({
		where: { slug: { in: params.leagueSlugs } },
	})
	if (leagues.length === 0) {
		console.log(`no leagues matched ${params.leagueSlugs.join(", ")}`)
		return
	}

	const now = new Date()
	for (const league of leagues) {
		const seasons = await db.query.seasons.findMany({
			where: { leagueId: league.id },
		})
		for (const season of seasons) {
			const start = season.regularSeasonStartsAt
			const end = season.regularSeasonEndsAt
			if (!start || !end) continue

			// Truncated to the hour - a fraction of a season lands on an arbitrary
			// second, and this is a time callers read off a countdown.
			const extended = new Date(
				start.getTime() + (end.getTime() - start.getTime()) * WINDOW_FRACTION,
			)
			extended.setMinutes(0, 0, 0)
			// Never shorten a window, and never reopen a season that is already
			// past the point this would move the lock to.
			if (extended <= now) continue

			const rows = await db.query.questions.findMany({
				where: {
					leagueId: league.id,
					seasonId: season.id,
					shape: "team_season_stat_numeric_guess",
				},
				columns: { id: true, title: true, locksAt: true, status: true },
			})
			const affected = rows.filter((q) => q.locksAt < extended)
			if (affected.length === 0) continue

			const wasLocked = affected.filter((q) => q.status === "locked").length
			console.log(
				`\n[${league.slug}] ${season.displayName}: ${affected.length} win-total question(s)` +
					`\n  ${affected[0]?.locksAt.toISOString()} -> ${extended.toISOString()}` +
					(wasLocked > 0 ? `\n  ${wasLocked} already locked, would reopen` : ""),
			)

			if (!params.apply) continue

			await db
				.update(questions)
				.set({ locksAt: extended, status: "open" })
				.where(
					and(
						inArray(
							questions.id,
							affected.map((q) => q.id),
						),
						eq(questions.shape, "team_season_stat_numeric_guess"),
					),
				)
			console.log(`  applied`)
		}
	}
	console.log(
		params.apply ? "\ndone" : "\ndry run - pass --apply to write these changes",
	)
}

if (isMainModule(import.meta.url)) {
	const args = process.argv.slice(2)
	const apply = args.includes("--apply")
	const slugs = args.filter((a) => !a.startsWith("--"))
	extendWinTotalLocks({
		leagueSlugs: slugs.length > 0 ? slugs : ["nfl", "nba"],
		apply,
	})
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
}

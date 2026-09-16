import { sql } from "drizzle-orm"
import { db } from "../db"

export type PointsAggregate = {
	totalPoints: number
	resolvedCallCount: number
	correctCount: number
	convictionSum: number
	convictionSumCorrect: number
	callCount: number
}

// Reads the denormalized per-(user, season) rollup (db/schema/season-stats.ts's
// userSeasonStats) rather than aggregating live over calls/call_selections -
// a leaderboard-sized user set never touches the calls table at all here.
// Always a GROUP BY: a season-keyed table has many rows per (user, league)
// over time, unlike the old per-(user, league) table this replaced, so
// there's no "narrow to exactly one row" shortcut anymore even when leagueId
// is given - just a WHERE clause on top of the same aggregate. Cheap
// regardless of a user's call count either way, since this table's size is
// bounded by leagues x seasons (a small admin-curated catalog x a handful of
// seasons each), not by calls.
//
// userIds narrows to that set of users (group leaderboard, single-user
// stats); omit it to aggregate every user with activity in scope (site-wide
// leaderboard). leagueIds narrows to those leagues' rows (one league tab, or a
// group's tracked leagues); omit it to sum across every league a user has
// played in. seasonIds narrows to those seasons (lib/seasons.ts resolves a
// scope to them); omit it to sum a user's whole career, every season they've
// played.
export async function aggregatePointsByUser(options: {
	userIds?: string[]
	leagueIds?: string[] | null
	seasonIds?: string[] | null
}): Promise<Map<string, PointsAggregate>> {
	const { userIds, leagueIds, seasonIds } = options
	// `in ()` is invalid SQL - an empty list means "nothing in scope", so
	// short-circuit rather than let it reach Postgres as a malformed filter.
	// An empty seasonIds is a real case, not a caller bug: "current season"
	// resolves to nothing for a league with no seasons synced yet.
	if (userIds && userIds.length === 0) return new Map()
	if (leagueIds && leagueIds.length === 0) return new Map()
	if (seasonIds && seasonIds.length === 0) return new Map()

	const userFilter = userIds ? sql`and user_id in ${userIds}` : sql``
	const leagueFilter = leagueIds ? sql`and league_id in ${leagueIds}` : sql``
	const seasonFilter = seasonIds ? sql`and season_id in ${seasonIds}` : sql``

	const result = await db.execute<{
		user_id: string
		total_points: number
		resolved_call_count: number
		correct_count: number
		conviction_sum: number
		conviction_sum_correct: number
		call_count: number
	}>(sql`
		select
			user_id,
			coalesce(sum(points), 0)::int as total_points,
			coalesce(sum(resolved_call_count), 0)::int as resolved_call_count,
			coalesce(sum(correct_count), 0)::int as correct_count,
			coalesce(sum(conviction_sum), 0)::int as conviction_sum,
			coalesce(sum(conviction_sum_correct), 0)::int as conviction_sum_correct,
			coalesce(sum(call_count), 0)::int as call_count
		from user_season_stats
		where true ${leagueFilter} ${seasonFilter} ${userFilter}
		group by user_id
	`)

	const map = new Map<string, PointsAggregate>()
	for (const row of result.rows) {
		// callCount can drop back to 0 (every call on a league voided away)
		// while the row itself still exists - treat that the same as "no
		// activity in scope", matching the old live-aggregate's behavior of
		// simply not producing a row for such a user.
		if (row.call_count === 0) continue
		map.set(row.user_id, {
			totalPoints: row.total_points,
			resolvedCallCount: row.resolved_call_count,
			correctCount: row.correct_count,
			convictionSum: row.conviction_sum,
			convictionSumCorrect: row.conviction_sum_correct,
			callCount: row.call_count,
		})
	}
	return map
}

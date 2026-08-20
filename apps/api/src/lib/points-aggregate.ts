import { sql } from "drizzle-orm"
import { db } from "../db"

export type PointsAggregate = {
	totalPoints: number
	resolvedCallCount: number
	correctCount: number
	callCount: number
}

// Reads the denormalized per-(user, league) rollup (db/schema/questions.ts's
// userLeagueStats) rather than aggregating live over calls/call_selections -
// a leaderboard-sized user set never touches the calls table at all here.
// leagueId narrows to that league's rows directly (already the right grain,
// no GROUP BY needed); omitting it sums across every league a user has
// played in - cheap regardless of a user's call count, since userLeagueStats'
// size is bounded by leagues (a small admin-curated catalog), not by calls.
//
// userIds narrows to that set of users (group leaderboard, single-user
// stats); omit it to aggregate every user with activity in scope (site-wide
// leaderboard).
export async function aggregatePointsByUser(options: {
	userIds?: string[]
	leagueId?: string | null
}): Promise<Map<string, PointsAggregate>> {
	const { userIds, leagueId } = options
	// `in ()` is invalid SQL - an empty userIds means "no one in scope", so
	// short-circuit rather than let it reach Postgres as a malformed filter.
	if (userIds && userIds.length === 0) return new Map()

	const userFilter = userIds ? sql`and user_id in ${userIds}` : sql``

	const result = leagueId
		? await db.execute<{
				user_id: string
				total_points: number
				resolved_call_count: number
				correct_count: number
				call_count: number
			}>(sql`
				select
					user_id,
					points as total_points,
					resolved_call_count,
					correct_count,
					call_count
				from user_league_stats
				where league_id = ${leagueId} ${userFilter}
			`)
		: await db.execute<{
				user_id: string
				total_points: number
				resolved_call_count: number
				correct_count: number
				call_count: number
			}>(sql`
				select
					user_id,
					coalesce(sum(points), 0)::int as total_points,
					coalesce(sum(resolved_call_count), 0)::int as resolved_call_count,
					coalesce(sum(correct_count), 0)::int as correct_count,
					coalesce(sum(call_count), 0)::int as call_count
				from user_league_stats
				where true ${userFilter}
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
			callCount: row.call_count,
		})
	}
	return map
}

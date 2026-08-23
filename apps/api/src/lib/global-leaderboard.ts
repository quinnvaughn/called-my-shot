import { db } from "../db"
import type { User } from "../db/schema"
import { aggregatePointsByUser } from "./points-aggregate"
import { accuracyFrom, compareRankableEntries } from "./scoring"

export type LeaderboardEntry = {
	rank: number
	user: User
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
}

// Site-wide ranking across every registered user, not just one group's
// members. leagueId narrows to calls on questions in that league only, same
// as the group version (types/group.ts). Unlike the group leaderboard -
// which seeds every member at 0 so a quiet member still shows up in their
// own group - this only includes users with at least one call: a public
// board listing every zero-point registered account would be noise, not
// signal.
//
// Every field here comes from aggregatePointsByUser, which reads the
// denormalized user_season_stats rollup rather than fetching every call/
// selection row into JS - cheap regardless of leagueId, since that table's
// size is bounded by leagues x seasons (a small admin-curated catalog x a
// handful of seasons each), not by call count. See db/schema/questions.ts's
// userSeasonStats for how it's kept in sync.
//
// Plain function (no Pothos/GraphQL dependency) so it can be shared by both
// graphql/types/leaderboard.ts and graphql/types/user.ts without those two
// importing from each other (they already each need a type the other
// defines - User.careerStats returns a LeaderboardEntry, and
// LeaderboardEntry.user returns a User - so a shared, dependency-free home
// for the business logic avoids a circular module import).
export async function buildGlobalLeaderboard(
	leagueId?: string | null,
): Promise<LeaderboardEntry[]> {
	const agg = await aggregatePointsByUser({ leagueId })
	if (agg.size === 0) return []

	const userRows = await db.query.users.findMany({
		where: { id: { in: [...agg.keys()] } },
	})
	const usersById = new Map(userRows.map((user) => [user.id, user]))

	const entries: Omit<LeaderboardEntry, "rank">[] = []
	for (const [userId, summary] of agg) {
		const user = usersById.get(userId)
		if (!user) continue
		entries.push({
			user,
			totalPoints: summary.totalPoints,
			accuracy: accuracyFrom(summary),
			callCount: summary.callCount,
			resolvedCallCount: summary.resolvedCallCount,
		})
	}

	entries.sort(compareRankableEntries)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
}

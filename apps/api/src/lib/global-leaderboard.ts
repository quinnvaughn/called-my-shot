import { db } from "../db"
import type { User } from "../db/schema"
import { accuracyFrom, scoreCalls } from "./scoring"

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
// Plain function (no Pothos/GraphQL dependency) so it can be shared by both
// graphql/types/leaderboard.ts and graphql/types/user.ts without those two
// importing from each other (they already each need a type the other
// defines - User.careerStats returns a LeaderboardEntry, and
// LeaderboardEntry.user returns a User - so a shared, dependency-free home
// for the business logic avoids a circular module import).
export async function buildGlobalLeaderboard(
	leagueId?: string | null,
): Promise<LeaderboardEntry[]> {
	const users = await db.query.users.findMany()

	const callsRaw = await db.query.calls.findMany({
		with: {
			selections: { with: { option: true } },
			question: { columns: { leagueId: true } },
		},
	})
	const calls = leagueId
		? callsRaw.filter((call) => call.question?.leagueId === leagueId)
		: callsRaw

	const callsByUser = new Map<string, typeof calls>()
	for (const call of calls) {
		const existing = callsByUser.get(call.userId)
		if (existing) existing.push(call)
		else callsByUser.set(call.userId, [call])
	}

	const entries = users.flatMap((user) => {
		const userCalls = callsByUser.get(user.id) ?? []
		if (userCalls.length === 0) return []

		const summary = scoreCalls(userCalls)

		return [
			{
				user,
				totalPoints: summary.totalPoints,
				accuracy: accuracyFrom(summary),
				callCount: userCalls.length,
				resolvedCallCount: summary.resolvedCallCount,
			},
		]
	})

	entries.sort((a, b) => b.totalPoints - a.totalPoints)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
}

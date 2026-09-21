import { COLD_STREAK_MIN, HOT_STREAK_MIN } from "@called-my-shot/scoring"
import { db } from "../db"
import type { League, User, UserStreak, UserSweep } from "../db/schema"

// The most any one list hands back, however large the group. The band on the
// group page asks for three; the sheet behind its "see all" asks for this.
const MAX_HIGHLIGHTS = 50

export type GroupStreakEntry = {
	user: User
	league: League
	streak: UserStreak
}
export type GroupSweepEntry = { user: User; league: League; sweep: UserSweep }

export type GroupHighlights = {
	hotStreaks: GroupStreakEntry[]
	coldStreaks: GroupStreakEntry[]
	streakRecords: GroupStreakEntry[]
	recentSweeps: GroupSweepEntry[]
}

const EMPTY: GroupHighlights = {
	hotStreaks: [],
	coldStreaks: [],
	streakRecords: [],
	recentSweeps: [],
}

// A group's tracked leagues bound its highlights the same way they bound its
// leaderboard. Unlike the leaderboard there's no league tab or season to
// narrow further: a streak has no season at all (a run carries across one), so
// a season filter could only ever apply to half of this. `tracked` is the
// group's getTrackedLeagueIds, null for every league.
export async function buildGroupHighlights(
	memberIds: string[],
	tracked: string[] | null,
): Promise<GroupHighlights> {
	if (memberIds.length === 0) return EMPTY

	const scope = {
		userId: { in: memberIds },
		...(tracked ? { leagueId: { in: tracked } } : {}),
	}
	const [hot, cold, records, sweeps] = await Promise.all([
		db.query.userStreaks.findMany({
			where: { ...scope, currentLength: { gte: HOT_STREAK_MIN } },
			orderBy: { currentLength: "desc", lastSettledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userStreaks.findMany({
			where: { ...scope, currentColdLength: { gte: COLD_STREAK_MIN } },
			orderBy: { currentColdLength: "desc", lastSettledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userStreaks.findMany({
			where: { ...scope, bestLength: { gte: HOT_STREAK_MIN } },
			orderBy: { bestLength: "desc", bestEndedAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
		db.query.userSweeps.findMany({
			where: scope,
			orderBy: { settledAt: "desc" },
			limit: MAX_HIGHLIGHTS,
		}),
	])

	// One read each for the names and the league tags every row carries,
	// rather than a per-row resolve on four lists of up to 50.
	const rows = [...hot, ...cold, ...records, ...sweeps]
	const [users, leagues] = await Promise.all([
		db.query.users.findMany({
			where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
		}),
		db.query.leagues.findMany({
			where: { id: { in: [...new Set(rows.map((r) => r.leagueId))] } },
		}),
	])
	const userById = new Map(users.map((u) => [u.id, u]))
	const leagueById = new Map(leagues.map((l) => [l.id, l]))

	// A member removed from the group between the two reads drops out rather
	// than resolving to a null user.
	function join<T extends { userId: string; leagueId: string }, R>(
		list: T[],
		make: (user: User, league: League, row: T) => R,
	): R[] {
		return list.flatMap((row) => {
			const user = userById.get(row.userId)
			const league = leagueById.get(row.leagueId)
			return user && league ? [make(user, league, row)] : []
		})
	}
	const streakEntry = (user: User, league: League, streak: UserStreak) => ({
		user,
		league,
		streak,
	})

	return {
		hotStreaks: join(hot, streakEntry),
		coldStreaks: join(cold, streakEntry),
		streakRecords: join(records, streakEntry),
		recentSweeps: join(sweeps, (user, league, sweep) => ({
			user,
			league,
			sweep,
		})),
	}
}

export function clampHighlightLimit(limit: number | null | undefined): number {
	if (limit === null || limit === undefined) return MAX_HIGHLIGHTS
	return Math.max(1, Math.min(limit, MAX_HIGHLIGHTS))
}

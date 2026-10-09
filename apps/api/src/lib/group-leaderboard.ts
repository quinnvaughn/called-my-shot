import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../db"
import { calls, type Game, games, questions, type User } from "../db/schema"
import { aggregatePointsByUser } from "./points-aggregate"
import { accuracyFrom, rankEntries } from "./scoring"

export type GroupLeaderboardEntry = {
	// null until this member has a resolved call (see rankEntries)
	rank: number | null
	user: User
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
}

// leagueIds narrows the ranking to calls made on questions in those leagues
// and seasonIds to calls in those seasons (points/accuracy recomputed from
// scratch, not a filter over the all-league numbers) - null for either ranks
// across every league/season. Scoped to league, not sport - NBA and NCAAB
// calls shouldn't rank against each other even though both are basketball.
//
// Points/accuracy/counts come from an indexed SQL GROUP BY
// (aggregatePointsByUser), scoped to just this group's member ids, instead
// of fetching every member's call/selection rows into JS - unlike the site
// leaderboard, a group is small enough that this alone is plenty fast
// without also reading the denormalized users.points column.
export async function buildGroupLeaderboard(
	groupId: string,
	leagueIds: string[] | null,
	seasonIds: string[] | null,
): Promise<GroupLeaderboardEntry[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		with: { user: true },
	})
	const memberIds = memberships.flatMap((m) => (m.user ? [m.userId] : []))
	const agg = await aggregatePointsByUser({
		userIds: memberIds,
		leagueIds,
		seasonIds,
	})

	const entries = memberships.flatMap((membership) => {
		if (!membership.user) return []
		const summary = agg.get(membership.userId)

		return [
			{
				user: membership.user,
				totalPoints: summary?.totalPoints ?? 0,
				accuracy: summary ? accuracyFrom(summary) : null,
				callCount: summary?.callCount ?? 0,
				resolvedCallCount: summary?.resolvedCallCount ?? 0,
			},
		]
	})

	return rankEntries(entries)
}

// A group's tracked leagues (getTrackedLeagueIds) bound every ranking of it.
// A league tab inside that set narrows to just that league; no tab, or a tab
// for a league the group doesn't track (a link shared before an admin changed
// the set), ranks across the whole set.
export function leagueScope(
	tracked: string[] | null,
	leagueId: string | null,
): string[] | null {
	if (leagueId && (tracked === null || tracked.includes(leagueId))) {
		return [leagueId]
	}
	return tracked
}

export async function getMemberUserIds(groupId: string): Promise<string[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		columns: { userId: true },
	})
	return memberships.map((m) => m.userId)
}

export type UnsettledCalls = {
	count: number
	// The soonest-starting game behind any of them, or null when none has a
	// game (season stats, awards).
	nextGame: Game | null
}

// One user's calls in a leaderboard scope that haven't settled yet, so an
// unranked member can be told when a first result is coming. Scoped the
// same way as buildGroupLeaderboard; unscored calls never settle into a
// rank, so they're left out.
export async function loadUnsettledCalls(
	userId: string,
	leagueIds: string[] | null,
	seasonIds: string[] | null,
): Promise<UnsettledCalls> {
	const rows = await db
		.select({ game: games })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.leftJoin(games, eq(games.id, questions.gameId))
		.where(
			and(
				eq(calls.userId, userId),
				isNull(calls.unscoredReason),
				inArray(questions.status, ["open", "locked"]),
				leagueIds ? inArray(questions.leagueId, leagueIds) : undefined,
				seasonIds ? inArray(questions.seasonId, seasonIds) : undefined,
			),
		)
		.orderBy(asc(games.startsAt))
	return {
		count: rows.length,
		nextGame: rows.find((row) => row.game)?.game ?? null,
	}
}

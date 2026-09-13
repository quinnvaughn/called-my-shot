import { db } from "../../../db"
import type { User } from "../../../db/schema"
import { getTrackedLeagueIds } from "../../../lib/groups"
import { aggregatePointsByUser } from "../../../lib/points-aggregate"
import { accuracyFrom, rankEntries } from "../../../lib/scoring"
import {
	resolveSeasonIds,
	type SeasonFilter,
	seasonFilterKey,
} from "../../../lib/seasons"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { type Connection, PageInfoRef } from "../pagination"
import { UserRef } from "../user"
import { GroupRole } from "./enums"

export type GroupLeaderboardEntry = {
	// null until this member has a resolved call (see rankEntries)
	rank: number | null
	user: User
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
	role: "admin" | "member"
}

export const GroupLeaderboardEntryRef = builder
	.objectRef<GroupLeaderboardEntry>("GroupLeaderboardEntry")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank", { nullable: true }),
			totalPoints: t.exposeInt("totalPoints"),
			// % of this member's resolved picks that hit - null until they have any
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
			role: t.field({ type: GroupRole, resolve: (entry) => entry.role }),
			user: t.field({ type: UserRef, resolve: (entry) => entry.user }),
		}),
	})

export const GroupLeaderboardConnectionRef = builder
	.objectRef<Connection<GroupLeaderboardEntry>>("GroupLeaderboardConnection")
	.implement({
		fields: (t) => ({
			items: t.field({
				type: [GroupLeaderboardEntryRef],
				resolve: (c) => c.items,
			}),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

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
async function buildLeaderboard(
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
				role: membership.role,
			},
		]
	})

	return rankEntries(entries)
}

// A group's tracked leagues bound every ranking of it. A league tab inside
// that set narrows to just that league; no tab, or a tab for a league the
// group doesn't track (a link shared before an admin changed the set), ranks
// across the whole set.
async function leagueScope(
	groupId: string,
	leagueId: string | null,
): Promise<string[] | null> {
	const tracked = await getTrackedLeagueIds(groupId)
	if (leagueId && (tracked === null || tracked.includes(leagueId))) {
		return [leagueId]
	}
	return tracked
}

// leaderboard, viewerRank, and viewerLeaderboardEntry below can all fire on
// the same group page load, each needing the same ranking for the same
// (groupId, leagueId, season) - this shares one in-flight buildLeaderboard
// call between them instead of each re-aggregating and re-sorting from
// scratch. Same pattern as getGlobalLeaderboard in
// graphql/types/leaderboard.ts, season filter included in the key for the
// same reason: two fields asking for different scopes must not share one
// ranking.
export function getGroupLeaderboard(
	ctx: Context,
	groupId: string,
	leagueId: string | null,
	season: SeasonFilter,
) {
	const key = `${groupId}:${leagueId ?? ""}:${seasonFilterKey(season)}`
	let cached = ctx.groupLeaderboardCache.get(key)
	if (!cached) {
		cached = leagueScope(groupId, leagueId).then(async (leagueIds) => {
			// A season only resolves against one league (see resolveSeasonIds);
			// with several in scope, CURRENT unions every league's current season
			// and the league filter in the aggregate drops the untracked ones.
			const seasonLeagueId = leagueIds?.length === 1 ? leagueIds[0] : null
			const seasonIds = await resolveSeasonIds(season, seasonLeagueId)
			return buildLeaderboard(groupId, leagueIds, seasonIds)
		})
		ctx.groupLeaderboardCache.set(key, cached)
	}
	return cached
}

export async function getMemberUserIds(groupId: string): Promise<string[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		columns: { userId: true },
	})
	return memberships.map((m) => m.userId)
}

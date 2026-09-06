import { db } from "../../../db"
import type { User } from "../../../db/schema"
import { aggregatePointsByUser } from "../../../lib/points-aggregate"
import { accuracyFrom, compareRankableEntries } from "../../../lib/scoring"
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
	rank: number
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
			rank: t.exposeInt("rank"),
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

// leagueId narrows the ranking to calls made on questions in that league only
// and seasonIds to calls in those seasons (points/accuracy recomputed from
// scratch, not a filter over the all-league numbers) - null/undefined for
// either ranks across every league/season, same as before these params
// existed. Scoped to league, not sport - NBA and NCAAB calls shouldn't rank
// against each other even though both are basketball.
//
// Points/accuracy/counts come from an indexed SQL GROUP BY
// (aggregatePointsByUser), scoped to just this group's member ids, instead
// of fetching every member's call/selection rows into JS - unlike the site
// leaderboard, a group is small enough that this alone is plenty fast
// without also reading the denormalized users.points column.
async function buildLeaderboard(
	groupId: string,
	leagueId: string | null,
	seasonIds: string[] | null,
): Promise<GroupLeaderboardEntry[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		with: { user: true },
	})
	const memberIds = memberships.flatMap((m) => (m.user ? [m.userId] : []))
	const agg = await aggregatePointsByUser({
		userIds: memberIds,
		leagueId,
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

	entries.sort(compareRankableEntries)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
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
		cached = resolveSeasonIds(season, leagueId).then((seasonIds) =>
			buildLeaderboard(groupId, leagueId, seasonIds),
		)
		ctx.groupLeaderboardCache.set(key, cached)
	}
	return cached
}

// Cheaper than buildLeaderboard for callers that only need the #1 name and
// point total (e.g. the invite preview teaser) - no accuracy join, no full
// sort, just a single pass to find the max over one scoped aggregate query.
export async function findTopScorer(
	memberUsers: User[],
): Promise<{ user: User; totalPoints: number }> {
	// A group can't structurally have zero members - creation seeds the
	// creator as a member, and leaveGroup deletes the group once the last
	// member leaves. Callers should only ever pass the members of a group
	// that exists.
	if (memberUsers.length === 0) {
		throw new Error("findTopScorer called with no members")
	}

	const agg = await aggregatePointsByUser({
		userIds: memberUsers.map((u) => u.id),
	})

	// iterate memberUsers (not the aggregate map) so a member who hasn't
	// called anything is still tied for the top spot, not absent from it, and
	// ties break toward whoever comes first in that same order.
	let top: { user: User; totalPoints: number } | null = null
	for (const user of memberUsers) {
		const totalPoints = agg.get(user.id)?.totalPoints ?? 0
		if (top && totalPoints <= top.totalPoints) continue
		top = { user, totalPoints }
	}
	if (!top)
		throw new Error("findTopScorer found no top scorer despite having members")
	return top
}

export async function getMemberUserIds(groupId: string): Promise<string[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		columns: { userId: true },
	})
	return memberships.map((m) => m.userId)
}

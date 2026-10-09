import { db } from "../../../db"
import type { groupMembers } from "../../../db/schema"
import {
	buildGroupLeaderboard,
	type GroupLeaderboardEntry,
	getMemberUserIds,
	leagueScope,
} from "../../../lib/group-leaderboard"
import { getTrackedLeagueIds } from "../../../lib/groups"
import {
	resolveSeasonIds,
	type SeasonFilter,
	seasonFilterKey,
} from "../../../lib/seasons"
import { builder } from "../../builder"
import { type Context, ctxCache } from "../../context"
import { ctxLoader, indexByKey } from "../../loader"
import { type Connection, PageInfoRef } from "../pagination"
import { UserRef } from "../user"

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

type GroupMember = typeof groupMembers.$inferSelect

// A group page reads the tracked leagues and the roster from several fields
// at once (the leaderboard, the highlights band, each activity tab), so both
// are read at most once per group per request.
export function trackedLeagueIds(ctx: Context, groupId: string) {
	return ctxCache(ctx, `trackedLeagues:${groupId}`, () =>
		getTrackedLeagueIds(groupId),
	)
}

export function memberUserIds(ctx: Context, groupId: string) {
	return ctxCache(ctx, `memberUserIds:${groupId}`, () =>
		getMemberUserIds(groupId),
	)
}

// The viewer's own membership row in each group asked about, batched across
// a page of groups. Keyed by groupId alone because the viewer is fixed for
// the request.
const viewerMembershipLoader = ctxLoader(
	async (groupIds: string[], ctx): Promise<(GroupMember | null)[]> => {
		if (!ctx.user) return groupIds.map(() => null)
		const rows = await db.query.groupMembers.findMany({
			where: { userId: ctx.user.id, groupId: { in: groupIds } },
		})
		return indexByKey(groupIds, rows, (row) => row.groupId, null)
	},
)

export function viewerMembership(
	ctx: Context,
	groupId: string,
): Promise<GroupMember | null> {
	if (!ctx.user) return Promise.resolve(null)
	return viewerMembershipLoader(ctx).load(groupId)
}

// leaderboard, viewerRank, and viewerLeaderboardEntry on Group, plus
// groupPreview, can all fire on the same page load, each needing the same
// ranking for the same (groupId, leagueId, season) - this shares one
// in-flight buildGroupLeaderboard call between them. The season filter is in
// the key because two fields asking for different scopes must not share one
// ranking.
// The leagues and seasons one of the group's leaderboards ranks over.
export async function groupLeaderboardScope(
	ctx: Context,
	groupId: string,
	leagueId: string | null,
	season: SeasonFilter,
): Promise<{ leagueIds: string[] | null; seasonIds: string[] | null }> {
	const leagueIds = leagueScope(await trackedLeagueIds(ctx, groupId), leagueId)
	// A season only resolves against one league (see resolveSeasonIds);
	// with several in scope, CURRENT unions every league's current season
	// and the league filter in the aggregate drops the untracked ones.
	const seasonLeagueId = leagueIds?.length === 1 ? leagueIds[0] : null
	const seasonIds = await resolveSeasonIds(season, seasonLeagueId)
	return { leagueIds, seasonIds }
}

export function getGroupLeaderboard(
	ctx: Context,
	groupId: string,
	leagueId: string | null,
	season: SeasonFilter,
): Promise<GroupLeaderboardEntry[]> {
	return ctxCache(
		ctx,
		`groupLeaderboard:${groupId}:${leagueId ?? ""}:${seasonFilterKey(season)}`,
		async () => {
			const { leagueIds, seasonIds } = await groupLeaderboardScope(
				ctx,
				groupId,
				leagueId,
				season,
			)
			return buildGroupLeaderboard(groupId, leagueIds, seasonIds)
		},
	)
}

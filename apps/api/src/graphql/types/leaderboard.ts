import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../lib/global-leaderboard"
import {
	clampPageSize,
	decodeOffsetCursor,
	encodeOffsetCursor,
} from "../../lib/pagination"
import { builder } from "../builder"
import type { Context } from "../context"
import { PageInfoRef } from "./pagination"
import { UserRef } from "./user"

// leaderboard and viewerLeaderboardEntry both need the full ranking for the
// same leagueId on the same request (a LeaderboardPage load fires both) -
// this shares one in-flight buildGlobalLeaderboard call between them instead
// of each independently re-aggregating and re-sorting from scratch.
function getGlobalLeaderboard(ctx: Context, leagueId?: string | null) {
	const key = leagueId ?? ""
	let cached = ctx.globalLeaderboardCache.get(key)
	if (!cached) {
		cached = buildGlobalLeaderboard(leagueId)
		ctx.globalLeaderboardCache.set(key, cached)
	}
	return cached
}

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

const LeaderboardEntryRef = builder
	.objectRef<LeaderboardEntry>("LeaderboardEntry")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank"),
			totalPoints: t.exposeInt("totalPoints"),
			// % of this user's resolved picks that hit - null until they have any
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
			user: t.field({ type: UserRef, resolve: (entry) => entry.user }),
		}),
	})

const LeaderboardConnectionRef = builder
	.objectRef<Connection<LeaderboardEntry>>("LeaderboardConnection")
	.implement({
		fields: (t) => ({
			items: t.field({
				type: [LeaderboardEntryRef],
				resolve: (c) => c.items,
			}),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

builder.queryFields((t) => ({
	leaderboard: t.field({
		type: LeaderboardConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
		},
		resolve: async (_root, args, ctx) => {
			const entries = await getGlobalLeaderboard(ctx, args.leagueId)
			const limit = clampPageSize(args.first)
			const afterRank = args.after ? decodeOffsetCursor(args.after) : 0
			const items = entries.slice(afterRank, afterRank + limit)
			const hasNextPage = afterRank + limit < entries.length
			return {
				items,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0
							? encodeOffsetCursor(afterRank + items.length)
							: null,
				},
			}
		},
	}),

	// null when signed out, or when the viewer hasn't made a call yet - both
	// are normal here (unlike the group version, membership doesn't guarantee
	// the viewer has ever called anything site-wide).
	viewerLeaderboardEntry: t.field({
		type: LeaderboardEntryRef,
		nullable: true,
		args: { leagueId: t.arg.id() },
		resolve: async (_root, args, ctx) => {
			if (!ctx.user) return null
			const entries = await getGlobalLeaderboard(ctx, args.leagueId)
			return entries.find((e) => e.user.id === ctx.user?.id) ?? null
		},
	}),
}))

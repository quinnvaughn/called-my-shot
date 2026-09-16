import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../lib/global-leaderboard"
import {
	clampPageSize,
	decodeOffsetCursor,
	encodeOffsetCursor,
} from "../../lib/pagination"
import {
	resolveSeasonIds,
	type SeasonFilter,
	seasonFilterKey,
} from "../../lib/seasons"
import { builder } from "../builder"
import type { Context } from "../context"
import { PageInfoRef } from "./pagination"
import { SeasonFilterInput, toSeasonFilter } from "./season-filter"
import { UserRef } from "./user"

// leaderboard and viewerLeaderboardEntry both need the full ranking for the
// same scope on the same request (a LeaderboardPage load fires both) - this
// shares one in-flight buildGlobalLeaderboard call between them instead of
// each independently re-aggregating and re-sorting from scratch. The season
// filter is part of the key for the same reason leagueId is: two fields
// asking for different scopes must not share one ranking.
function getGlobalLeaderboard(
	ctx: Context,
	leagueId: string | null,
	season: SeasonFilter,
) {
	const key = `${leagueId ?? ""}:${seasonFilterKey(season)}`
	let cached = ctx.globalLeaderboardCache.get(key)
	if (!cached) {
		cached = resolveSeasonIds(season, leagueId).then((seasonIds) =>
			buildGlobalLeaderboard({ leagueId, seasonIds }),
		)
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
			rank: t.exposeInt("rank", { nullable: true }),
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
			season: t.arg({ type: SeasonFilterInput, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const entries = (
				await getGlobalLeaderboard(
					ctx,
					args.leagueId ?? null,
					toSeasonFilter(args.season),
				)
			).filter((entry) => entry.rank !== null)
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

	// null only when signed out. A signed-in viewer with no calls in scope
	// isn't on the board at all, so they get an unranked zero entry instead,
	// letting the pinned card say why they have no rank rather than vanish.
	viewerLeaderboardEntry: t.field({
		type: LeaderboardEntryRef,
		nullable: true,
		args: {
			leagueId: t.arg.id(),
			season: t.arg({ type: SeasonFilterInput, required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const viewer = ctx.user
			if (!viewer) return null
			const entries = await getGlobalLeaderboard(
				ctx,
				args.leagueId ?? null,
				toSeasonFilter(args.season),
			)
			return (
				entries.find((e) => e.user.id === viewer.id) ?? {
					rank: null,
					user: viewer,
					totalPoints: 0,
					accuracy: null,
					convictionEdge: null,
					callCount: 0,
					resolvedCallCount: 0,
				}
			)
		},
	}),
}))

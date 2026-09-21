import type { LeaderboardEntry } from "../../lib/global-leaderboard"
import { sliceOffsetPage } from "../../lib/pagination"
import { builder } from "../builder"
import { type Connection, PageInfoRef } from "./pagination"
import { SeasonFilterInput, toSeasonFilter } from "./season-filter"
import { getGlobalLeaderboard, UserRef } from "./user"

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
			const entries = await getGlobalLeaderboard(
				ctx,
				args.leagueId ?? null,
				toSeasonFilter(args.season),
			)
			return sliceOffsetPage(
				entries.filter((entry) => entry.rank !== null),
				args,
			)
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

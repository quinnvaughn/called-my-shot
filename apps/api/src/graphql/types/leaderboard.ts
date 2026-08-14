import { ValidationError } from "../../lib/errors"
import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../lib/global-leaderboard"
import { clampPageSize } from "../../lib/pagination"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"
import { UserRef } from "./user"

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

// Same scheme as the group leaderboard's cursor (types/group.ts) - the board
// is fully recomputed and sorted in memory on every call, so the cursor is
// just the rank already reached rather than a DB-ordered keyset.
function encodeLeaderboardCursor(rank: number): string {
	return Buffer.from(String(rank)).toString("base64url")
}

function decodeLeaderboardCursor(cursor: string): number {
	const rank = Number(Buffer.from(cursor, "base64url").toString("utf8"))
	if (!Number.isInteger(rank) || rank < 0) {
		throw ValidationError.field("after", "Invalid pagination cursor")
	}
	return rank
}

builder.queryFields((t) => ({
	leaderboard: t.field({
		type: LeaderboardConnectionRef,
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
			leagueId: t.arg.id(),
		},
		resolve: async (_root, args) => {
			const entries = await buildGlobalLeaderboard(args.leagueId)
			const limit = clampPageSize(args.first)
			const afterRank = args.after ? decodeLeaderboardCursor(args.after) : 0
			const items = entries.slice(afterRank, afterRank + limit)
			const hasNextPage = afterRank + limit < entries.length
			return {
				items,
				pageInfo: {
					hasNextPage,
					endCursor:
						items.length > 0
							? encodeLeaderboardCursor(afterRank + items.length)
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
			const entries = await buildGlobalLeaderboard(args.leagueId)
			return entries.find((e) => e.user.id === ctx.user?.id) ?? null
		},
	}),
}))

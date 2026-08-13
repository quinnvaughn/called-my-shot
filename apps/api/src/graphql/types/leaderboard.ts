import { db } from "../../db"
import type { User } from "../../db/schema"
import { clampPageSize } from "../../lib/pagination"
import { ValidationError } from "../../lib/errors"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"
import { UserRef } from "./user"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

type LeaderboardEntry = {
	rank: number
	user: User
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
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

// Site-wide ranking across every registered user, not just one group's
// members. leagueId narrows to calls on questions in that league only, same
// as the group version. Unlike the group leaderboard - which seeds every
// member at 0 so a quiet member still shows up in their own group - this
// only includes users with at least one call: a public board listing every
// zero-point registered account would be noise, not signal.
async function buildGlobalLeaderboard(
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

		let totalPoints = 0
		let resolvedCallCount = 0
		let correctCount = 0

		for (const call of userCalls) {
			if (call.selections.length > 0) {
				for (const selection of call.selections) {
					if (selection.resultPoints === null) continue
					resolvedCallCount++
					totalPoints += selection.resultPoints
					if (selection.option?.isCorrect) correctCount++
				}
			} else if (call.resultPoints !== null) {
				resolvedCallCount++
				totalPoints += call.resultPoints
				if (call.hitTolerance) correctCount++
			}
		}

		return [
			{
				user,
				totalPoints,
				accuracy:
					resolvedCallCount > 0
						? (correctCount / resolvedCallCount) * 100
						: null,
				callCount: userCalls.length,
				resolvedCallCount,
			},
		]
	})

	entries.sort((a, b) => b.totalPoints - a.totalPoints)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
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

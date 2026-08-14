import { updateNameSchema } from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import type { League } from "../../db/schema"
import { type questionCategory, users } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import { AuthenticationError, ValidationError } from "../../lib/errors"
import {
	buildGlobalLeaderboard,
	type LeaderboardEntry,
} from "../../lib/global-leaderboard"
import { accuracyFrom, scoreCalls } from "../../lib/scoring"
import { builder } from "../builder"
import { CallRef, QuestionCategory } from "./question"
import { LeagueRef } from "./sports"

// Deliberately doesn't reuse LeaderboardEntryRef from ./leaderboard: that
// type has its own `user` field, and importing it here would make this
// module and leaderboard.ts each depend on a type the other defines
// (LeaderboardEntry.user needs UserRef, User.careerStats needs
// LeaderboardEntry) - a real circular module import, not just a formatting
// preference. This ref skips the redundant `user` field entirely.
const UserCareerStatsRef = builder
	.objectRef<LeaderboardEntry>("UserCareerStats")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank"),
			totalPoints: t.exposeInt("totalPoints"),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
		}),
	})

export const UserRef = builder.drizzleObject("users", {
	name: "User",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		username: t.exposeString("username"),
		email: t.exposeString("email"),
		createdAt: t.field({
			type: "String",
			resolve: (user) => user.createdAt.toISOString(),
		}),
		// null until this user has made a single call site-wide
		careerStats: t.field({
			type: UserCareerStatsRef,
			nullable: true,
			resolve: async (user) => {
				const entries = await buildGlobalLeaderboard(null)
				return entries.find((entry) => entry.user.id === user.id) ?? null
			},
		}),
		leagues: t.field({
			type: [UserLeagueStatsRef],
			resolve: (user) => buildUserLeagueStats(user.id),
		}),
		recentCalls: t.field({
			type: [CallRef],
			resolve: (user) =>
				db.query.calls.findMany({
					where: { userId: user.id },
					orderBy: { createdAt: "desc", id: "desc" },
					limit: 3,
				}),
		}),
	}),
})

type CategoryAccuracyData = {
	category: (typeof questionCategory.enumValues)[number]
	accuracy: number | null
	callCount: number
}

const CategoryAccuracyRef = builder
	.objectRef<CategoryAccuracyData>("CategoryAccuracy")
	.implement({
		fields: (t) => ({
			category: t.field({ type: QuestionCategory, resolve: (c) => c.category }),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
		}),
	})

type UserLeagueStatsData = {
	league: League
	totalPoints: number
	rank: number
	accuracy: number | null
	callCount: number
	categoryBreakdown: CategoryAccuracyData[]
}

const UserLeagueStatsRef = builder
	.objectRef<UserLeagueStatsData>("UserLeagueStats")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (row) => row.league }),
			totalPoints: t.exposeInt("totalPoints"),
			rank: t.exposeInt("rank"),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			categoryBreakdown: t.field({
				type: [CategoryAccuracyRef],
				resolve: (row) => row.categoryBreakdown,
			}),
		}),
	})

// One entry per league this user has ever called a question in. Rank/points/
// accuracy/callCount reuse buildGlobalLeaderboard (same board the site-wide
// leaderboard renders) scoped to that league; category breakdown is new,
// computed the same way but grouped by question.category instead of by user.
async function buildUserLeagueStats(
	userId: string,
): Promise<UserLeagueStatsData[]> {
	const userCalls = await db.query.calls.findMany({
		where: { userId },
		with: {
			selections: { with: { option: true } },
			question: { columns: { leagueId: true, category: true } },
		},
	})

	const callsByLeague = new Map<string, typeof userCalls>()
	for (const call of userCalls) {
		const leagueId = call.question?.leagueId
		if (!leagueId) continue
		const existing = callsByLeague.get(leagueId)
		if (existing) existing.push(call)
		else callsByLeague.set(leagueId, [call])
	}
	if (callsByLeague.size === 0) return []

	const leagueIds = [...callsByLeague.keys()]
	const leagues = await db.query.leagues.findMany({
		where: { id: { in: leagueIds } },
	})
	const leaguesById = new Map(leagues.map((league) => [league.id, league]))

	const results: UserLeagueStatsData[] = []
	for (const leagueId of leagueIds) {
		const league = leaguesById.get(leagueId)
		const calls = callsByLeague.get(leagueId)
		if (!league || !calls) continue

		// user has at least one call in this league by construction above, and
		// buildGlobalLeaderboard only excludes users with zero calls in scope,
		// so this entry always exists.
		const boardEntries = await buildGlobalLeaderboard(leagueId)
		const entry = boardEntries.find((e) => e.user.id === userId)
		if (!entry) continue

		const callsByCategory = new Map<
			CategoryAccuracyData["category"],
			typeof calls
		>()
		for (const call of calls) {
			const category = call.question?.category
			if (!category) continue
			const existing = callsByCategory.get(category)
			if (existing) existing.push(call)
			else callsByCategory.set(category, [call])
		}

		const categoryBreakdown: CategoryAccuracyData[] = [
			...callsByCategory.entries(),
		].map(([category, categoryCalls]) => {
			const summary = scoreCalls(categoryCalls)
			return {
				category,
				accuracy: accuracyFrom(summary),
				callCount: categoryCalls.length,
			}
		})

		results.push({
			league,
			totalPoints: entry.totalPoints,
			rank: entry.rank,
			accuracy: entry.accuracy,
			callCount: entry.callCount,
			categoryBreakdown,
		})
	}

	return results
}

const UpdateMyNameInput = builder.inputType("UpdateMyNameInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
	}),
})

builder.queryFields((t) => ({
	me: t.field({
		type: UserRef,
		nullable: true,
		resolve: (_root, _args, ctx) => ctx.user,
	}),
	user: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			id: t.arg.id({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { id: args.id } })),
	}),
	userByUsername: t.drizzleField({
		type: "users",
		nullable: true,
		args: {
			username: t.arg.string({ required: true }),
		},
		resolve: (query, _root, args) =>
			db.query.users.findFirst(query({ where: { username: args.username } })),
	}),
}))

builder.mutationFields((t) => ({
	updateMyName: t.field({
		type: UserRef,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "UpdateMyNameResult" },
		},
		args: { input: t.arg({ type: UpdateMyNameInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = updateNameSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}

			const [updated] = await db
				.update(users)
				.set({ name: parsed.data.name })
				.where(eq(users.id, user.id))
				.returning()
			if (!updated) throw new Error("updateMyName: user vanished mid-request")
			return updated
		},
	}),
}))

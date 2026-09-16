import { db } from "../../../db"
import type { League, questionShape } from "../../../db/schema"
import { buildGlobalLeaderboard } from "../../../lib/global-leaderboard"
import { accuracyFrom, convictionEdge, scoreCalls } from "../../../lib/scoring"
import { builder } from "../../builder"
import { QuestionShape } from "../question"
import { LeagueRef } from "../sports"

type ShapeAccuracyData = {
	shape: (typeof questionShape.enumValues)[number]
	accuracy: number | null
	convictionEdge: number | null
	callCount: number
	resolvedCallCount: number
}

const ShapeAccuracyRef = builder
	.objectRef<ShapeAccuracyData>("ShapeAccuracy")
	.implement({
		fields: (t) => ({
			shape: t.field({ type: QuestionShape, resolve: (s) => s.shape }),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			convictionEdge: t.exposeFloat("convictionEdge", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
		}),
	})

type UserLeagueStatsData = {
	league: League
	totalPoints: number
	rank: number | null
	accuracy: number | null
	convictionEdge: number | null
	callCount: number
	resolvedCallCount: number
	shapeBreakdown: ShapeAccuracyData[]
}

export const UserLeagueStatsRef = builder
	.objectRef<UserLeagueStatsData>("UserLeagueStats")
	.implement({
		fields: (t) => ({
			league: t.field({ type: LeagueRef, resolve: (row) => row.league }),
			totalPoints: t.exposeInt("totalPoints"),
			rank: t.exposeInt("rank", { nullable: true }),
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			convictionEdge: t.exposeFloat("convictionEdge", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
			shapeBreakdown: t.field({
				type: [ShapeAccuracyRef],
				resolve: (row) => row.shapeBreakdown,
			}),
		}),
	})

// One entry per league this user has ever called a question in. Rank/points/
// accuracy/callCount reuse buildGlobalLeaderboard scoped to that league and
// to no season - a profile shows a career in each league, not this season's
// standing in it (the leaderboard itself is where a season-scoped ranking
// lives). Shape breakdown is new, computed the same way but grouped by
// question.shape instead of by user.
export async function buildUserLeagueStats(
	userId: string,
): Promise<UserLeagueStatsData[]> {
	const userCalls = await db.query.calls.findMany({
		where: { userId },
		with: {
			selections: { with: { option: true } },
			question: { columns: { leagueId: true, shape: true } },
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
		const boardEntries = await buildGlobalLeaderboard({ leagueId })
		const entry = boardEntries.find((e) => e.user.id === userId)
		if (!entry) continue

		const callsByShape = new Map<ShapeAccuracyData["shape"], typeof calls>()
		for (const call of calls) {
			const shape = call.question?.shape
			if (!shape) continue
			const existing = callsByShape.get(shape)
			if (existing) existing.push(call)
			else callsByShape.set(shape, [call])
		}

		const shapeBreakdown: ShapeAccuracyData[] = [...callsByShape.entries()].map(
			([shape, shapeCalls]) => {
				const summary = scoreCalls(shapeCalls)
				return {
					shape,
					accuracy: accuracyFrom(summary),
					convictionEdge: convictionEdge(summary),
					callCount: shapeCalls.length,
					resolvedCallCount: summary.resolvedCallCount,
				}
			},
		)

		results.push({
			league,
			totalPoints: entry.totalPoints,
			rank: entry.rank,
			accuracy: entry.accuracy,
			convictionEdge: entry.convictionEdge,
			callCount: entry.callCount,
			resolvedCallCount: entry.resolvedCallCount,
			shapeBreakdown,
		})
	}

	return results
}

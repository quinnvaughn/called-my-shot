import {
	and,
	count,
	countDistinct,
	eq,
	inArray,
	isNotNull,
	lte,
	max,
	ne,
	notInArray,
	sql,
} from "drizzle-orm"
import { db } from "../db"
import {
	calls,
	groupMembers,
	questions,
	type User,
	userBlocks,
} from "../db/schema"

// How many of a game's group callers come back as people, the rest only
// counted. A group can be a whole fanbase, so the list is never sent whole.
export const GROUP_CALLER_PREVIEW = 3

export type GroupCallers = { count: number; preview: User[] }

// Distinct users with at least one call on each game, official and community
// questions both. A game nobody called is missing from the map.
export async function loadCallerCounts(
	gameIds: string[],
): Promise<Map<string, number>> {
	if (gameIds.length === 0) return new Map()
	const rows = await db
		.select({ gameId: questions.gameId, n: countDistinct(calls.userId) })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(inArray(questions.gameId, gameIds))
		.groupBy(questions.gameId)
	return new Map(rows.flatMap((r) => (r.gameId ? [[r.gameId, r.n]] : [])))
}

// How many questions on each game one user called.
export async function loadUserCalledCounts(
	userId: string,
	gameIds: string[],
): Promise<Map<string, number>> {
	if (gameIds.length === 0) return new Map()
	const rows = await db
		.select({ gameId: questions.gameId, n: count() })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(and(eq(calls.userId, userId), inArray(questions.gameId, gameIds)))
		.groupBy(questions.gameId)
	return new Map(rows.flatMap((r) => (r.gameId ? [[r.gameId, r.n]] : [])))
}

// People who share a group with the viewer and called each game, the viewer
// and anyone they've blocked left out. The preview is the most recent
// callers first; count is all of them.
export async function loadGroupCallers(
	viewerId: string,
	gameIds: string[],
): Promise<Map<string, GroupCallers>> {
	if (gameIds.length === 0) return new Map()
	const viewerGroups = db
		.select({ groupId: groupMembers.groupId })
		.from(groupMembers)
		.where(eq(groupMembers.userId, viewerId))
	const peers = db
		.select({ userId: groupMembers.userId })
		.from(groupMembers)
		.where(inArray(groupMembers.groupId, viewerGroups))
	const blocked = db
		.select({ userId: userBlocks.blockedId })
		.from(userBlocks)
		.where(eq(userBlocks.blockerId, viewerId))

	const ranked = db
		.select({
			gameId: sql<string>`${questions.gameId}`.as("game_id"),
			userId: sql<string>`${calls.userId}`.as("user_id"),
			rank: sql<number>`row_number() over (partition by ${questions.gameId} order by ${max(calls.createdAt)} desc, ${calls.userId})`
				.mapWith(Number)
				.as("rank"),
			total: sql<number>`count(*) over (partition by ${questions.gameId})`
				.mapWith(Number)
				.as("total"),
		})
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(
			and(
				isNotNull(questions.gameId),
				inArray(questions.gameId, gameIds),
				inArray(calls.userId, peers),
				ne(calls.userId, viewerId),
				notInArray(calls.userId, blocked),
			),
		)
		.groupBy(questions.gameId, calls.userId)
		.as("ranked")

	const rows = await db
		.select()
		.from(ranked)
		.where(lte(ranked.rank, GROUP_CALLER_PREVIEW))
		.orderBy(ranked.gameId, ranked.rank)
	if (rows.length === 0) return new Map()

	const users = await db.query.users.findMany({
		where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
	})
	const userById = new Map(users.map((u) => [u.id, u]))

	const byGame = new Map<string, GroupCallers>()
	for (const row of rows) {
		const user = userById.get(row.userId)
		const entry: GroupCallers = byGame.get(row.gameId) ?? {
			count: row.total,
			preview: [],
		}
		if (user) entry.preview.push(user)
		byGame.set(row.gameId, entry)
	}
	return byGame
}

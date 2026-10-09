import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { calls, type Presser, pressers, questions } from "../../../db/schema"
import { ctxLoader, indexByKey } from "../../loader"

export const presserKey = (userId: string, gameId: string) =>
	`${userId}:${gameId}`

// A user's presser on a game, keyed presserKey(userId, gameId).
export const presserByUserGameLoader = ctxLoader(
	async (keys: string[]): Promise<(Presser | null)[]> => {
		const userIds = [...new Set(keys.map((key) => key.split(":")[0] ?? ""))]
		const gameIds = [...new Set(keys.map((key) => key.split(":")[1] ?? ""))]
		const rows = await db
			.select()
			.from(pressers)
			.where(
				and(
					inArray(pressers.userId, userIds),
					inArray(pressers.gameId, gameIds),
				),
			)
		return indexByKey(
			keys,
			rows,
			(row) => presserKey(row.userId, row.gameId),
			null,
		)
	},
)

// The presser covering a call: its caller's, on its question's game.
export const presserByCallLoader = ctxLoader(
	async (callIds: string[]): Promise<(Presser | null)[]> => {
		const rows = await db
			.select({ callId: calls.id, presser: pressers })
			.from(calls)
			.innerJoin(questions, eq(questions.id, calls.questionId))
			.innerJoin(
				pressers,
				and(
					eq(pressers.gameId, questions.gameId),
					eq(pressers.userId, calls.userId),
				),
			)
			.where(inArray(calls.id, callIds))
		return indexByKey(callIds, rows, (row) => row.callId, null).map((row) =>
			row ? row.presser : null,
		)
	},
)

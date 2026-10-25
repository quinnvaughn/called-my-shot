import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { type FollowTargetKind, follows } from "../../../db/schema"
import { ctxLoader } from "../../loader"

export const followKey = (kind: FollowTargetKind, id: string) => `${kind}:${id}`

// Whether the signed-in viewer follows each "{kind}:{id}". Always false
// signed out.
export const viewerFollowsLoader = ctxLoader(
	async (keys: string[], ctx): Promise<boolean[]> => {
		if (!ctx.user) return keys.map(() => false)
		const ids = [...new Set(keys.map((key) => key.split(":")[1] ?? ""))]
		const rows = await db
			.select({ kind: follows.targetKind, id: follows.targetId })
			.from(follows)
			.where(
				and(
					eq(follows.followerId, ctx.user.id),
					inArray(follows.targetId, ids),
				),
			)
		const followed = new Set(rows.map((row) => followKey(row.kind, row.id)))
		return keys.map((key) => followed.has(key))
	},
)

// How many people follow each user.
export const followerCountLoader = ctxLoader(
	async (userIds: string[]): Promise<number[]> => {
		const rows = await db
			.select({ id: follows.targetId, n: count() })
			.from(follows)
			.where(
				and(eq(follows.targetKind, "user"), inArray(follows.targetId, userIds)),
			)
			.groupBy(follows.targetId)
		const byId = new Map(rows.map((row) => [row.id, row.n]))
		return userIds.map((id) => byId.get(id) ?? 0)
	},
)

// How many people each user follows. Spaces they follow aren't counted.
export const followingCountLoader = ctxLoader(
	async (userIds: string[]): Promise<number[]> => {
		const rows = await db
			.select({ id: follows.followerId, n: count() })
			.from(follows)
			.where(
				and(
					eq(follows.targetKind, "user"),
					inArray(follows.followerId, userIds),
				),
			)
			.groupBy(follows.followerId)
		const byId = new Map(rows.map((row) => [row.id, row.n]))
		return userIds.map((id) => byId.get(id) ?? 0)
	},
)

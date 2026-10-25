import { db } from "../../../db"
import type {
	League,
	Player,
	PostTag,
	Prompt,
	RushmorePick,
	Team,
} from "../../../db/schema"
import {
	firstReplies,
	postCommentCount,
	replyCounts,
} from "../../../lib/posts/comment-thread"
import {
	type PromptConsensus,
	promptConsensus,
} from "../../../lib/posts/consensus"
import { ctxLoader, groupByKey, indexByKey } from "../../loader"

// Per-request batches behind the post, prompt and thread fields, so a feed
// page of posts costs one query per kind of fact rather than one per post.

export const picksByPostLoader = ctxLoader(
	async (postIds: string[]): Promise<RushmorePick[][]> => {
		const rows = await db.query.rushmorePicks.findMany({
			where: { postId: { in: postIds } },
			orderBy: { position: "asc" },
		})
		return groupByKey(postIds, rows, (row) => row.postId)
	},
)

export const tagsByPostLoader = ctxLoader(
	async (postIds: string[]): Promise<PostTag[][]> => {
		const rows = await db.query.postTags.findMany({
			where: { postId: { in: postIds } },
		})
		return groupByKey(postIds, rows, (row) => row.postId)
	},
)

export const promptByIdLoader = ctxLoader(
	async (ids: string[]): Promise<(Prompt | null)[]> => {
		const rows = await db.query.prompts.findMany({
			where: { id: { in: ids } },
		})
		return indexByKey(ids, rows, (row) => row.id, null)
	},
)

export const playerByIdLoader = ctxLoader(
	async (ids: string[]): Promise<(Player | null)[]> => {
		const rows = await db.query.players.findMany({
			where: { id: { in: ids } },
		})
		return indexByKey(ids, rows, (row) => row.id, null)
	},
)

export const teamByIdLoader = ctxLoader(
	async (ids: string[]): Promise<(Team | null)[]> => {
		const rows = await db.query.teams.findMany({ where: { id: { in: ids } } })
		return indexByKey(ids, rows, (row) => row.id, null)
	},
)

export const leagueByIdLoader = ctxLoader(
	async (ids: string[]): Promise<(League | null)[]> => {
		const rows = await db.query.leagues.findMany({
			where: { id: { in: ids } },
		})
		return indexByKey(ids, rows, (row) => row.id, null)
	},
)

export const consensusLoader = ctxLoader(
	async (promptIds: string[]): Promise<PromptConsensus[]> => {
		const byId = await promptConsensus(promptIds)
		return promptIds.map((id) => byId.get(id) ?? { answerCount: 0, picks: [] })
	},
)

export const commentCountLoader = ctxLoader(
	async (postIds: string[], ctx): Promise<number[]> => {
		const counts = await postCommentCount(ctx.user?.id ?? null, postIds)
		return postIds.map((id) => counts.get(id) ?? 0)
	},
)

export const replyCountLoader = ctxLoader(
	async (commentIds: string[], ctx): Promise<number[]> => {
		const counts = await replyCounts(ctx.user?.id ?? null, commentIds)
		return commentIds.map((id) => counts.get(id) ?? 0)
	},
)

// The first replies under each comment on a page of the thread, keyed by
// "{commentId}|{how many}" so a page asking for two each shares one query.
export const firstRepliesLoader = ctxLoader(async (keys: string[], ctx) => {
	const byLimit = new Map<number, string[]>()
	for (const key of keys) {
		const [parentId, n] = key.split("|")
		if (!parentId) continue
		const limit = Number(n)
		byLimit.set(limit, [...(byLimit.get(limit) ?? []), parentId])
	}
	const results = new Map<string, Awaited<ReturnType<typeof firstReplies>>>()
	for (const [limit, parentIds] of byLimit) {
		results.set(
			String(limit),
			await firstReplies(ctx.user?.id ?? null, parentIds, limit),
		)
	}
	return keys.map((key) => {
		const [parentId, n] = key.split("|")
		return results.get(n ?? "")?.get(parentId ?? "") ?? []
	})
})

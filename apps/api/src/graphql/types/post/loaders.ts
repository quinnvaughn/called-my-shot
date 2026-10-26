import { db } from "../../../db"
import type {
	League,
	Player,
	PostTag,
	Prompt,
	RedraftPick,
	RushmorePick,
	Team,
} from "../../../db/schema"
import {
	type DraftSlot,
	draftSlots,
	originalPicks,
} from "../../../lib/drafts/class"
import {
	firstReplies,
	postCommentCount,
	replyCounts,
} from "../../../lib/posts/comment-thread"
import {
	type PromptConsensus,
	promptConsensus,
} from "../../../lib/posts/consensus"
import {
	type RedraftConsensus,
	redraftConsensus,
} from "../../../lib/posts/redraft-consensus"
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

export const redraftPicksByPostLoader = ctxLoader(
	async (postIds: string[]): Promise<RedraftPick[][]> => {
		const rows = await db.query.redraftPicks.findMany({
			where: { postId: { in: postIds } },
			orderBy: { slot: "asc" },
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

export const redraftConsensusLoader = ctxLoader(
	async (promptIds: string[]): Promise<RedraftConsensus[]> => {
		const byId = await redraftConsensus(promptIds)
		return promptIds.map(
			(id) => byId.get(id) ?? { answerCount: 0, slots: new Map() },
		)
	},
)

// The most slots a redraft can have, enough for any league's first round.
export const MAX_REDRAFT_SLOTS = 64

// A class's slots, which the teams on a redraft's picks come from.
export const classSlotsLoader = ctxLoader(
	async (prompts: Prompt[]): Promise<DraftSlot[][]> =>
		Promise.all(prompts.map((prompt) => draftSlots(prompt, MAX_REDRAFT_SLOTS))),
	{ cacheKeyFn: (prompt) => prompt.id },
)

// Where a player went in his draft, keyed "{leagueId}|{playerId}": the pick
// number, or null for one who came in undrafted.
export const originalPickLoader = ctxLoader(
	async (keys: string[]): Promise<(number | null)[]> => {
		const byLeague = new Map<string, string[]>()
		for (const key of keys) {
			const [leagueId = "", playerId = ""] = key.split("|")
			byLeague.set(leagueId, [...(byLeague.get(leagueId) ?? []), playerId])
		}
		const found = new Map<string, number | null>()
		for (const [leagueId, playerIds] of byLeague) {
			for (const [playerId, overall] of await originalPicks(
				db,
				leagueId,
				playerIds,
			)) {
				found.set(`${leagueId}|${playerId}`, overall)
			}
		}
		return keys.map((key) => found.get(key) ?? null)
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

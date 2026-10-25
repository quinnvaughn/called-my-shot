import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../../db"
import {
	groupMembers,
	type Post,
	type Prompt,
	prompts,
	userBlocks,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { isBlockedEitherWay } from "../pressers/ask"

// Who can see a post. A public one is anyone's unless an admin took it (or
// its prompt) down, or the viewer and the author have blocked each other. A
// group post is only ever its group's: to anyone else it doesn't exist.

export type LoadedPost = { post: Post; prompt: Prompt }

export async function canViewPost(
	q: DbOrTx,
	viewerId: string | null,
	{ post, prompt }: LoadedPost,
): Promise<boolean> {
	if (post.removedAt || prompt.removedAt) return false
	if (post.groupId) {
		if (!viewerId) return false
		const membership = await q.query.groupMembers.findFirst({
			where: { groupId: post.groupId, userId: viewerId },
			columns: { id: true },
		})
		if (!membership) return false
	}
	if (viewerId && viewerId !== post.authorId) {
		if (await isBlockedEitherWay(q, viewerId, post.authorId)) return false
	}
	return true
}

export async function loadPost(
	q: DbOrTx,
	postId: string,
): Promise<LoadedPost | null> {
	const post = await q.query.posts.findFirst({
		where: { id: postId },
		with: { prompt: true },
	})
	if (!post?.prompt) return null
	const { prompt, ...row } = post
	return { post: row, prompt }
}

// The post if the viewer can see it, else null.
export async function loadVisiblePost(
	q: DbOrTx,
	viewerId: string | null,
	postId: string,
): Promise<LoadedPost | null> {
	const loaded = await loadPost(q, postId)
	if (!loaded) return null
	return (await canViewPost(q, viewerId, loaded)) ? loaded : null
}

// The same rules as SQL over a posts row, for the feeds (lib/posts/feeds.ts).
export function liveAndUnblocked(
	post: { removedAt: PgColumn; promptId: PgColumn; authorId: PgColumn },
	viewerId: string | null,
): SQL {
	const live = and(
		isNull(post.removedAt),
		sql`exists (select 1 from ${prompts} where ${prompts.id} = ${post.promptId} and ${prompts.removedAt} is null)`,
	) as SQL
	if (!viewerId) return live
	return and(live, notBlockedWith(viewerId, post.authorId)) as SQL
}

// Neither the viewer nor whoever `userId` names has blocked the other.
export function notBlockedWith(viewerId: string, userId: PgColumn): SQL {
	return sql`not exists (select 1 from ${userBlocks} where ${or(
		and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, userId)),
		and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, viewerId)),
	)})`
}

// The groups the viewer is in, as a subquery for `groupId in (...)`.
export function viewerGroupIds(viewerId: string) {
	return db
		.select({ groupId: groupMembers.groupId })
		.from(groupMembers)
		.where(eq(groupMembers.userId, viewerId))
}

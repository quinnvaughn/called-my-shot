import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { commentLikes, postLikes, type User } from "../db/schema"
import { ctxLoader } from "../graphql/loader"
import { NotFoundError, ValidationError } from "./errors"
import { createNotifications, likesMilestoneKey } from "./notifications"
import { loadVisiblePost } from "./posts/visibility"

// Likes on posts and on comments under them. A like is one person's, once:
// liking twice is still one like, and unliking something never liked is
// fine. They rank posts and comments (Top).
//
// Nobody is told about a single like. The author hears when the count
// reaches a milestone (likes_milestone, in-app only), once per milestone: a
// like that's taken back and given again around 25 doesn't announce 25 twice.

// 10, 25, 50, 100, then every hundred.
export function likesMilestone(likes: number): number | null {
	if (likes < 10) return null
	if (likes < 25) return 10
	if (likes < 50) return 25
	if (likes < 100) return 50
	return Math.floor(likes / 100) * 100
}

async function noteLikesMilestone(target: {
	authorId: string
	postId: string
	commentId: string | null
	likes: number
}): Promise<void> {
	const milestone = likesMilestone(target.likes)
	if (milestone === null) return
	await db.transaction(async (tx) => {
		const told = await tx.query.notifications.findFirst({
			where: {
				userId: target.authorId,
				dedupeKey: likesMilestoneKey(target.postId, target.commentId),
			},
			columns: { achievementCount: true },
		})
		if ((told?.achievementCount ?? 0) >= milestone) return
		await createNotifications(tx, [
			{
				type: "likes_milestone",
				userId: target.authorId,
				postId: target.postId,
				commentId: target.commentId,
				achievementCount: milestone,
			},
		])
	})
}

export async function likePost(user: User, postId: string): Promise<void> {
	const loaded = await loadVisiblePost(db, user.id, postId)
	if (!loaded) throw new NotFoundError("Post not found")
	const [added] = await db
		.insert(postLikes)
		.values({ postId, userId: user.id })
		.onConflictDoNothing()
		.returning({ postId: postLikes.postId })
	if (!added) return
	const [row] = await db
		.select({ n: count() })
		.from(postLikes)
		.where(eq(postLikes.postId, postId))
	await noteLikesMilestone({
		authorId: loaded.post.authorId,
		postId,
		commentId: null,
		likes: row?.n ?? 0,
	})
}

export async function unlikePost(user: User, postId: string): Promise<void> {
	await db
		.delete(postLikes)
		.where(and(eq(postLikes.postId, postId), eq(postLikes.userId, user.id)))
}

// Only comments on posts take likes: a chain's thread or a gloat is a
// conversation, not something ranked.
export async function likeComment(
	user: User,
	commentId: string,
): Promise<void> {
	const comment = await db.query.comments.findFirst({
		where: { id: commentId },
		columns: { postId: true, senderId: true, removedAt: true },
	})
	if (!comment || comment.removedAt) {
		throw new NotFoundError("Comment not found")
	}
	if (!comment.postId) {
		throw ValidationError.field(null, "Only comments on posts can be liked.")
	}
	if (!(await loadVisiblePost(db, user.id, comment.postId))) {
		throw new NotFoundError("Comment not found")
	}
	const [added] = await db
		.insert(commentLikes)
		.values({ commentId, userId: user.id })
		.onConflictDoNothing()
		.returning({ commentId: commentLikes.commentId })
	if (!added) return
	const [row] = await db
		.select({ n: count() })
		.from(commentLikes)
		.where(eq(commentLikes.commentId, commentId))
	await noteLikesMilestone({
		authorId: comment.senderId,
		postId: comment.postId,
		commentId,
		likes: row?.n ?? 0,
	})
}

export async function unlikeComment(
	user: User,
	commentId: string,
): Promise<void> {
	await db
		.delete(commentLikes)
		.where(
			and(
				eq(commentLikes.commentId, commentId),
				eq(commentLikes.userId, user.id),
			),
		)
}

export const postLikeCountLoader = ctxLoader(
	async (postIds: string[]): Promise<number[]> => {
		const rows = await db
			.select({ id: postLikes.postId, n: count() })
			.from(postLikes)
			.where(inArray(postLikes.postId, postIds))
			.groupBy(postLikes.postId)
		const byId = new Map(rows.map((row) => [row.id, row.n]))
		return postIds.map((id) => byId.get(id) ?? 0)
	},
)

export const commentLikeCountLoader = ctxLoader(
	async (commentIds: string[]): Promise<number[]> => {
		const rows = await db
			.select({ id: commentLikes.commentId, n: count() })
			.from(commentLikes)
			.where(inArray(commentLikes.commentId, commentIds))
			.groupBy(commentLikes.commentId)
		const byId = new Map(rows.map((row) => [row.id, row.n]))
		return commentIds.map((id) => byId.get(id) ?? 0)
	},
)

// Whether the signed-in viewer liked each one. Always false signed out.
export const viewerLikedPostLoader = ctxLoader(
	async (postIds: string[], ctx): Promise<boolean[]> => {
		if (!ctx.user) return postIds.map(() => false)
		const rows = await db
			.select({ id: postLikes.postId })
			.from(postLikes)
			.where(
				and(
					eq(postLikes.userId, ctx.user.id),
					inArray(postLikes.postId, postIds),
				),
			)
		const liked = new Set(rows.map((row) => row.id))
		return postIds.map((id) => liked.has(id))
	},
)

export const viewerLikedCommentLoader = ctxLoader(
	async (commentIds: string[], ctx): Promise<boolean[]> => {
		if (!ctx.user) return commentIds.map(() => false)
		const rows = await db
			.select({ id: commentLikes.commentId })
			.from(commentLikes)
			.where(
				and(
					eq(commentLikes.userId, ctx.user.id),
					inArray(commentLikes.commentId, commentIds),
				),
			)
		const liked = new Set(rows.map((row) => row.id))
		return commentIds.map((id) => liked.has(id))
	},
)

import type { CommentInput } from "@called-my-shot/schemas"
import { db } from "../../db"
import type { Comment, User } from "../../db/schema"
import {
	afterCommentSent,
	assertAllowedCommentText,
	insertComment,
	parseComment,
	unblockedRecipients,
} from "../comments/send"
import { NotFoundError, ValidationError } from "../errors"
import { createNotifications } from "../notifications"
import { canViewPost, type LoadedPost, loadPost } from "./visibility"

// A post's comments work like a video's: top-level comments, each with one
// flat list of replies under it. A reply always hangs off the top-level
// comment, never another reply; answering a reply stays on that level and
// names who it answers (replyToUserId), which the thread shows as an
// @mention. A top-level comment can be about one of a Rushmore's picks.
//
// Anyone who can see the post can comment: anyone signed in for a public
// one, its members for a group's. Someone the author has blocked, or who has
// blocked the author, can't see it to begin with (see canViewPost).

export type PostCommentInput = CommentInput & {
	parentId?: string | null
	replyToUserId?: string | null
}

export function canCommentOnPost(
	viewerId: string,
	loaded: LoadedPost,
): Promise<boolean> {
	return canViewPost(db, viewerId, loaded)
}

export async function sendPostComment(
	sender: User,
	postId: string,
	input: PostCommentInput,
): Promise<Comment> {
	const comment = parseComment(input)
	const loaded = await loadPost(db, postId)
	if (!loaded || !(await canCommentOnPost(sender.id, loaded))) {
		throw new NotFoundError("Post not found")
	}
	const { post } = loaded
	const parentId = input.parentId ?? null
	const replyToUserId = parentId ? (input.replyToUserId ?? null) : null
	if (input.replyToUserId && !parentId) {
		throw ValidationError.field(
			"replyToUserId",
			"Only a reply can answer someone.",
		)
	}

	const parent = parentId
		? await db.query.comments.findFirst({ where: { id: parentId } })
		: null
	if (parentId) {
		if (!parent || parent.postId !== post.id || parent.parentId !== null) {
			throw ValidationError.field(
				"parentId",
				"You can only reply to a comment on this post.",
			)
		}
		if (parent.removedAt) {
			throw ValidationError.field("parentId", "That comment was taken down.")
		}
	}
	if (replyToUserId && parent && replyToUserId !== parent.senderId) {
		const inThread = await db.query.comments.findFirst({
			where: { parentId: parent.id, senderId: replyToUserId },
			columns: { id: true },
		})
		if (!inThread) {
			throw ValidationError.field(
				"replyToUserId",
				"You can only answer someone in this thread.",
			)
		}
	}
	// The post's audience reads it, the same standard as a chain's thread.
	await assertAllowedCommentText(comment.text, sender.id, "standard", "post")

	const row = await db.transaction(async (tx) => {
		const inserted = await insertComment(
			tx,
			sender.id,
			{ kind: "post", postId: post.id, parentId, replyToUserId },
			comment,
		)
		if (parent) {
			const recipients = await unblockedRecipients(tx, sender.id, [
				...new Set([
					parent.senderId,
					...(replyToUserId ? [replyToUserId] : []),
				]),
			])
			await createNotifications(
				tx,
				recipients.map((userId) => ({
					type: "comment_replied" as const,
					userId,
					postId: post.id,
					commentId: parent.id,
					actorId: sender.id,
					actorUsername: sender.username,
				})),
			)
		} else {
			const recipients = await unblockedRecipients(tx, sender.id, [
				post.authorId,
			])
			await createNotifications(
				tx,
				recipients.map((userId) => ({
					type: "post_commented" as const,
					userId,
					postId: post.id,
					actorId: sender.id,
					actorUsername: sender.username,
				})),
			)
		}
		return inserted
	})
	afterCommentSent(comment, sender.id)
	return row
}

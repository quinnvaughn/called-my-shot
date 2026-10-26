import { and, desc, eq, isNull, ne } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { comments, type PostKind, users } from "../../db/schema"
import { notBlockedWith } from "./visibility"

// What a post thread's notifications say, read live at send (or render)
// time, since one notification stands for every comment since it was last
// read.

export const postPath = (postId: string) => `/posts/${postId}`

// What a kind of post is called in a sentence: "commented on your redraft".
export const postNoun = (kind: PostKind) =>
	match(kind)
		.with("rushmore", () => "Rushmore")
		.with("redraft", () => "redraft")
		.exhaustive()

export async function loadPostForPush(postId: string | null) {
	if (!postId) return null
	const post = await db.query.posts.findFirst({
		where: { id: postId },
		columns: { id: true, kind: true, removedAt: true },
		with: { prompt: { columns: { title: true, removedAt: true } } },
	})
	if (!post?.prompt || post.removedAt || post.prompt.removedAt) return null
	return {
		id: post.id,
		promptTitle: post.prompt.title,
		noun: postNoun(post.kind),
	}
}

// Who commented on the post last (top level), other than the recipient and
// anyone either of them has blocked.
export async function lastPostCommenter(
	postId: string,
	recipientId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ username: users.username })
		.from(comments)
		.innerJoin(users, eq(users.id, comments.senderId))
		.where(
			and(
				eq(comments.postId, postId),
				isNull(comments.parentId),
				ne(comments.senderId, recipientId),
				notBlockedWith(recipientId, comments.senderId),
			),
		)
		.orderBy(desc(comments.createdAt))
		.limit(1)
	return row?.username ?? null
}

// Who replied under a top-level comment last, the same way.
export async function lastReplier(
	commentId: string,
	recipientId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ username: users.username })
		.from(comments)
		.innerJoin(users, eq(users.id, comments.senderId))
		.where(
			and(
				eq(comments.parentId, commentId),
				ne(comments.senderId, recipientId),
				notBlockedWith(recipientId, comments.senderId),
			),
		)
		.orderBy(desc(comments.createdAt))
		.limit(1)
	return row?.username ?? null
}

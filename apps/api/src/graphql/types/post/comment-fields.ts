import { db } from "../../../db"
import {
	commentLikeCountLoader,
	viewerLikedCommentLoader,
} from "../../../lib/likes"
import { clampPageSize, encodeOffsetCursor } from "../../../lib/pagination"
import { INLINE_REPLIES, repliesTo } from "../../../lib/posts/comment-thread"
import { builder } from "../../builder"
import { CommentConnectionRef, CommentRef } from "../comment"
import { UserRef } from "../user"
import { firstRepliesLoader, replyCountLoader } from "./loaders"

// What a comment on a post adds: its replies, who a reply answers, and its
// likes. On a chain's thread or a gloat these are empty,
// null or zero.
builder.objectFields(CommentRef, (t) => ({
	// The top-level comment a reply sits under. Null on a top-level comment.
	parentId: t.id({ nullable: true, resolve: (c) => c.parentId }),
	// Replies, oldest first. Without `after` it's the first few the thread
	// shows inline (two by default), batched across the page.
	replies: t.field({
		type: CommentConnectionRef,
		args: {
			first: t.arg.int({ defaultValue: INLINE_REPLIES }),
			after: t.arg.string(),
		},
		resolve: async (c, args, ctx) => {
			if (!c.postId || c.parentId) {
				return { items: [], pageInfo: { hasNextPage: false, endCursor: null } }
			}
			if (args.after) {
				return repliesTo(ctx.user?.id ?? null, c.id, args)
			}
			const limit = clampPageSize(args.first ?? INLINE_REPLIES)
			const [items, total] = await Promise.all([
				firstRepliesLoader(ctx).load(`${c.id}|${limit}`),
				replyCountLoader(ctx).load(c.id),
			])
			return {
				items,
				pageInfo: {
					hasNextPage: total > items.length,
					endCursor: items.length > 0 ? encodeOffsetCursor(items.length) : null,
				},
			}
		},
	}),
	replyCount: t.int({
		resolve: (c, _args, ctx) =>
			c.postId && !c.parentId ? replyCountLoader(ctx).load(c.id) : 0,
	}),
	// Who a reply to a reply answers, shown as an @mention.
	replyTo: t.field({
		type: UserRef,
		nullable: true,
		resolve: async (c) =>
			c.replyToUserId
				? ((await db.query.users.findFirst({
						where: { id: c.replyToUserId },
					})) ?? null)
				: null,
	}),
	likeCount: t.int({
		resolve: (c, _args, ctx) => commentLikeCountLoader(ctx).load(c.id),
	}),
	viewerLiked: t.boolean({
		resolve: (c, _args, ctx) => viewerLikedCommentLoader(ctx).load(c.id),
	}),
}))

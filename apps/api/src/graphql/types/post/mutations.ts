import { db } from "../../../db"
import type { Comment, Post } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import {
	likeComment,
	likePost,
	unlikeComment,
	unlikePost,
} from "../../../lib/likes"
import { buildPickedPortraits } from "../../../lib/portraits/picked"
import { sendPostComment } from "../../../lib/posts/comment"
import { createRushmore } from "../../../lib/posts/create-rushmore"
import { deletePost } from "../../../lib/posts/delete-post"
import { updateRushmore } from "../../../lib/posts/update-rushmore"
import { builder } from "../../builder"
import { CommentGifInput, CommentRef, gifInputOf } from "../comment"
import { PostInterfaceRef } from "./refs"

const PostPayload = builder.objectRef<{ post: Post }>("PostPayload").implement({
	fields: (t) => ({
		post: t.field({ type: PostInterfaceRef, resolve: (p) => p.post }),
	}),
})

const DeletePostPayload = builder
	.objectRef<{ postId: string }>("DeletePostPayload")
	.implement({
		fields: (t) => ({
			deletedPostId: t.id({ resolve: (p) => p.postId }),
		}),
	})

const CommentPayload = builder
	.objectRef<{ comment: Comment }>("PostCommentPayload")
	.implement({
		fields: (t) => ({
			comment: t.field({ type: CommentRef, resolve: (p) => p.comment }),
		}),
	})

const CreateRushmoreInput = builder.inputType("CreateRushmoreInput", {
	fields: (t) => ({
		promptId: t.id({ required: true }),
		// Posts into this group instead of for everyone.
		groupId: t.id({ required: false }),
		body: t.string({ required: false }),
		// Exactly four, left to right.
		playerIds: t.idList({ required: true }),
	}),
})

const UpdateRushmoreInput = builder.inputType("UpdateRushmoreInput", {
	fields: (t) => ({
		postId: t.id({ required: true }),
		// An empty string clears it.
		body: t.string({ required: true }),
	}),
})

const SendPostCommentInput = builder.inputType("SendPostCommentInput", {
	fields: (t) => ({
		postId: t.id({ required: true }),
		// The top-level comment this replies to. Replying to a reply still
		// passes the top-level comment here, and names who it answers in
		// replyToUserId.
		parentId: t.id({ required: false }),
		replyToUserId: t.id({ required: false }),
		text: t.string({ required: false }),
		gif: t.field({ type: CommentGifInput, required: false }),
	}),
})

const POST_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

const errors = (name: string) => ({
	types: [...POST_ERRORS],
	directResult: true as const,
	union: { name },
})

async function postOrThrow(postId: string): Promise<Post> {
	const post = await db.query.posts.findFirst({ where: { id: postId } })
	if (!post) throw new NotFoundError("Post not found")
	return post
}

async function commentOrThrow(commentId: string): Promise<Comment> {
	const comment = await db.query.comments.findFirst({
		where: { id: commentId },
	})
	if (!comment) throw new NotFoundError("Comment not found")
	return comment
}

const idOrNull = (id: string | number | null | undefined) =>
	id === null || id === undefined ? null : String(id)

// How long posting waits on its picks' portraits.
const PORTRAIT_WAIT_MS = 6000

builder.mutationFields((t) => ({
	createRushmore: t.field({
		type: PostPayload,
		errors: errors("CreateRushmoreResult"),
		args: { input: t.arg({ type: CreateRushmoreInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const post = await createRushmore(user, {
				promptId: String(args.input.promptId),
				groupId: idOrNull(args.input.groupId),
				body: args.input.body ?? "",
				playerIds: args.input.playerIds.map(String),
			})
			// Portraits for any pick that doesn't have one yet, so the share image
			// has their faces from the start. Capped, since a slow photo CDN
			// shouldn't hold up posting: a portrait that misses the cap still
			// lands in R2 and shows from the next load on.
			await Promise.race([
				buildPickedPortraits(args.input.playerIds.map(String)).catch(
					(error) => {
						console.error("[portraits] building picks failed:", error)
					},
				),
				new Promise((resolve) => setTimeout(resolve, PORTRAIT_WAIT_MS)),
			])
			return { post }
		},
	}),

	updateRushmore: t.field({
		type: PostPayload,
		errors: errors("UpdateRushmoreResult"),
		args: { input: t.arg({ type: UpdateRushmoreInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const post = await updateRushmore(user, {
				postId: String(args.input.postId),
				body: args.input.body,
			})
			return { post }
		},
	}),

	deletePost: t.field({
		type: DeletePostPayload,
		errors: errors("DeletePostResult"),
		args: { postId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const postId = String(args.postId)
			await deletePost(user, postId)
			return { postId }
		},
	}),

	sendPostComment: t.field({
		type: CommentPayload,
		errors: errors("SendPostCommentResult"),
		args: { input: t.arg({ type: SendPostCommentInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const comment = await sendPostComment(user, String(args.input.postId), {
				text: args.input.text ?? "",
				gif: gifInputOf(args.input.gif),
				parentId: idOrNull(args.input.parentId),
				replyToUserId: idOrNull(args.input.replyToUserId),
			})
			return { comment }
		},
	}),

	likePost: t.field({
		type: PostPayload,
		errors: errors("LikePostResult"),
		args: { postId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const postId = String(args.postId)
			await likePost(user, postId)
			return { post: await postOrThrow(postId) }
		},
	}),

	unlikePost: t.field({
		type: PostPayload,
		errors: errors("UnlikePostResult"),
		args: { postId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const postId = String(args.postId)
			await unlikePost(user, postId)
			return { post: await postOrThrow(postId) }
		},
	}),

	likeComment: t.field({
		type: CommentPayload,
		errors: errors("LikeCommentResult"),
		args: { commentId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const commentId = String(args.commentId)
			await likeComment(user, commentId)
			return { comment: await commentOrThrow(commentId) }
		},
	}),

	unlikeComment: t.field({
		type: CommentPayload,
		errors: errors("UnlikeCommentResult"),
		args: { commentId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const commentId = String(args.commentId)
			await unlikeComment(user, commentId)
			return { comment: await commentOrThrow(commentId) }
		},
	}),
}))

import { db } from "../../../db"
import type { Comment } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { sendChainComment } from "../../../lib/chains/comment"
import {
	callOffChain,
	decideLink,
	leaveChain,
	requestLink,
	startChain,
} from "../../../lib/chains/mutate"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import { builder } from "../../builder"
import { CommentGifInput, CommentRef, gifInputOf } from "../comment"
import { ChainRef } from "./refs"

const ChainPayload = builder
	.objectRef<{ chainId: string }>("ChainPayload")
	.implement({
		fields: (t) => ({
			chain: t.field({
				type: ChainRef,
				nullable: true,
				resolve: (p) =>
					db.query.chains
						.findFirst({ where: { id: p.chainId } })
						.then((chain) => chain ?? null),
			}),
		}),
	})

const ChainCommentPayload = builder
	.objectRef<{ comment: Comment }>("ChainCommentPayload")
	.implement({
		fields: (t) => ({
			comment: t.field({ type: CommentRef, resolve: (p) => p.comment }),
		}),
	})

const StartChainInput = builder.inputType("StartChainInput", {
	fields: (t) => ({
		groupId: t.id({ required: true }),
		callId: t.id({ required: true }),
	}),
})

const RequestChainLinkInput = builder.inputType("RequestChainLinkInput", {
	fields: (t) => ({
		chainId: t.id({ required: true }),
		callId: t.id({ required: true }),
	}),
})

const SendChainCommentInput = builder.inputType("SendChainCommentInput", {
	fields: (t) => ({
		chainId: t.id({ required: true }),
		text: t.string({ required: false }),
		gif: t.field({ type: CommentGifInput, required: false }),
	}),
})

const CHAIN_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

const errors = (name: string) => ({
	types: [...CHAIN_ERRORS],
	directResult: true as const,
	union: { name },
})

builder.mutationFields((t) => ({
	startChain: t.field({
		type: ChainPayload,
		errors: errors("StartChainResult"),
		args: { input: t.arg({ type: StartChainInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const chain = await db.transaction((tx) =>
				startChain(tx, user, {
					groupId: String(args.input.groupId),
					callId: String(args.input.callId),
				}),
			)
			return { chainId: chain.id }
		},
	}),

	requestChainLink: t.field({
		type: ChainPayload,
		errors: errors("RequestChainLinkResult"),
		args: { input: t.arg({ type: RequestChainLinkInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const chainId = String(args.input.chainId)
			await db.transaction((tx) =>
				requestLink(tx, user, { chainId, callId: String(args.input.callId) }),
			)
			return { chainId }
		},
	}),

	approveChainLink: t.field({
		type: ChainPayload,
		errors: errors("ApproveChainLinkResult"),
		args: { linkId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return decided(user, String(args.linkId), true)
		},
	}),

	declineChainLink: t.field({
		type: ChainPayload,
		errors: errors("DeclineChainLinkResult"),
		args: { linkId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return decided(user, String(args.linkId), false)
		},
	}),

	leaveChain: t.field({
		type: ChainPayload,
		errors: errors("LeaveChainResult"),
		args: { chainId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const chainId = String(args.chainId)
			await db.transaction((tx) => leaveChain(tx, user, chainId))
			return { chainId }
		},
	}),

	callOffChain: t.field({
		type: ChainPayload,
		errors: errors("CallOffChainResult"),
		args: { chainId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const chainId = String(args.chainId)
			await db.transaction((tx) => callOffChain(tx, user, chainId))
			return { chainId }
		},
	}),

	sendChainComment: t.field({
		type: ChainCommentPayload,
		errors: errors("SendChainCommentResult"),
		args: { input: t.arg({ type: SendChainCommentInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const comment = await sendChainComment(user, String(args.input.chainId), {
				text: args.input.text ?? "",
				gif: gifInputOf(args.input.gif),
			})
			return { comment }
		},
	}),
}))

async function decided(
	user: { id: string; username: string },
	linkId: string,
	approve: boolean,
) {
	const link = await db.query.chainLinks.findFirst({
		where: { id: linkId },
		columns: { chainId: true },
	})
	if (!link) throw new NotFoundError("That request doesn't exist.")
	await db.transaction((tx) => decideLink(tx, user, linkId, approve))
	return { chainId: link.chainId }
}

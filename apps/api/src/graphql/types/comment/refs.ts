import { db } from "../../../db"
import type { Comment, CommentReport } from "../../../db/schema"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { ctxLoader, groupByKey } from "../../loader"
import { type Connection, PageInfoRef } from "../pagination"
import { PresserReportReasonEnum } from "../presser/refs"
import { UserRef } from "../user"

// Everyone the viewer has blocked: their comments aren't shown to the viewer.
export const viewerBlockedIdsLoader = ctxLoader(
	async (viewerIds: string[]): Promise<Set<string>[]> => {
		const rows = await db.query.userBlocks.findMany({
			where: { blockerId: { in: viewerIds } },
			columns: { blockerId: true, blockedId: true },
		})
		return groupByKey(viewerIds, rows, (r) => r.blockerId).map(
			(list) => new Set(list.map((r) => r.blockedId)),
		)
	},
)

// The comments the viewer can see: none from someone they've blocked.
export async function visibleComments(
	ctx: Context,
	rows: Comment[],
): Promise<Comment[]> {
	if (!ctx.user) return rows
	const blocked = await viewerBlockedIdsLoader(ctx).load(ctx.user.id)
	return rows.filter((row) => !blocked.has(row.senderId))
}

type StoredGif = {
	id: string
	url: string
	width: number
	height: number
	alt: string
}

export function storedGifOf(comment: Comment): StoredGif | null {
	if (
		comment.removedAt ||
		!comment.gifId ||
		!comment.gifUrl ||
		!comment.gifWidth ||
		!comment.gifHeight
	) {
		return null
	}
	return {
		id: comment.gifId,
		url: comment.gifUrl,
		width: comment.gifWidth,
		height: comment.gifHeight,
		alt: comment.gifAlt ?? "",
	}
}

export const CommentGifRef = builder
	.objectRef<StoredGif>("CommentGif")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			url: t.exposeString("url"),
			width: t.exposeInt("width"),
			height: t.exposeInt("height"),
			alt: t.exposeString("alt"),
		}),
	})

export const CommentRef = builder.objectRef<Comment>("Comment").implement({
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({ type: "DateTime", resolve: (c) => c.createdAt }),
		sender: t.field({
			type: UserRef,
			resolve: async (c) => {
				const user = await db.query.users.findFirst({
					where: { id: c.senderId },
				})
				if (!user) throw new Error("Comment sender missing")
				return user
			},
		}),
		// Taken down off a report. Its text and GIF are null from then on.
		removed: t.boolean({ resolve: (c) => c.removedAt !== null }),
		text: t.string({
			nullable: true,
			resolve: (c) => (c.removedAt ? null : c.text),
		}),
		gif: t.field({
			type: CommentGifRef,
			nullable: true,
			resolve: (c) => storedGifOf(c),
		}),
		viewerIsSender: t.boolean({
			resolve: (c, _args, ctx) => ctx.user?.id === c.senderId,
		}),
	}),
})

export const CommentConnectionRef = builder
	.objectRef<Connection<Comment>>("CommentConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [CommentRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

export const CommentGifInput = builder.inputType("CommentGifInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		url: t.string({ required: true }),
		width: t.int({ required: true }),
		height: t.int({ required: true }),
		alt: t.string({ required: false }),
	}),
})

// The GraphQL gif input as the comment schema takes it.
export function gifInputOf(
	gif:
		| {
				id: string | number
				url: string
				width: number
				height: number
				alt?: string | null
		  }
		| null
		| undefined,
) {
	return gif
		? {
				id: String(gif.id),
				url: gif.url,
				width: gif.width,
				height: gif.height,
				alt: gif.alt ?? "",
			}
		: null
}

export const CommentReportRef = builder
	.objectRef<CommentReport>("CommentReport")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			reason: t.field({
				type: PresserReportReasonEnum,
				resolve: (r) => r.reason,
			}),
			details: t.exposeString("details", { nullable: true }),
			createdAt: t.field({ type: "DateTime", resolve: (r) => r.createdAt }),
			reporter: t.field({
				type: UserRef,
				nullable: true,
				resolve: (r) =>
					db.query.users
						.findFirst({ where: { id: r.reporterId } })
						.then((user) => user ?? null),
			}),
			comment: t.field({
				type: CommentRef,
				resolve: async (r) => {
					const comment = await db.query.comments.findFirst({
						where: { id: r.commentId },
					})
					if (!comment) throw new Error("Reported comment missing")
					return comment
				},
			}),
			// Where the comment was posted, for the admin to read it in place:
			// a challenge's code, or a chain and the group it's in.
			challengeCode: t.string({
				nullable: true,
				resolve: async (r) => {
					const comment = await db.query.comments.findFirst({
						where: { id: r.commentId },
						with: { challenge: { columns: { code: true } } },
					})
					return comment?.challenge?.code ?? null
				},
			}),
			chainId: t.id({
				nullable: true,
				resolve: async (r) => {
					const comment = await db.query.comments.findFirst({
						where: { id: r.commentId },
						columns: { chainId: true },
					})
					return comment?.chainId ?? null
				},
			}),
			groupId: t.id({
				nullable: true,
				resolve: async (r) => {
					const comment = await db.query.comments.findFirst({
						where: { id: r.commentId },
						with: { chain: { columns: { groupId: true } } },
					})
					return comment?.chain?.groupId ?? null
				},
			}),
		}),
	})

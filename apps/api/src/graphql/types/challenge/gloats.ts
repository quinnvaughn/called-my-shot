import { and, eq, isNotNull } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Comment,
	type CommentReport,
	commentReports,
	comments,
} from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import { canGloat, sendChallengeGloat } from "../../../lib/challenges/gloat"
import {
	dismissCommentReport,
	removeComment,
	reportComment,
} from "../../../lib/comments/reports"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	allowGifSearch,
	isKlipyConfigured,
	type KlipyGif,
	searchGifs,
	trendingGifs,
} from "../../../lib/gifs/klipy"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { ctxLoader, groupByKey } from "../../loader"
import { viewerBlockedIdsLoader } from "../comment"
import { PresserReportReasonEnum } from "../presser/refs"
import { UserRef } from "../user"
import { type ChallengeView, challengeViewLoader } from "./loaders"
import { ChallengeMatchupRef, ChallengeRef } from "./refs"

// A gloat is a comment on a challenge, under the challenge's rules (see
// lib/challenges/gloat.ts). The names here stay "gloat" because that's what
// the challenge screens call it.
type Gloat = Comment
type GloatReport = CommentReport

const gloatsByChallengeLoader = ctxLoader(
	async (challengeIds: string[]): Promise<Gloat[][]> => {
		const rows = await db.query.comments.findMany({
			where: { challengeId: { in: challengeIds } },
		})
		return groupByKey(challengeIds, rows, (g) => g.challengeId ?? "")
	},
)

// A gloat the viewer can see: not from someone they've blocked.
async function visibleGloat(
	ctx: Context,
	gloat: Gloat | undefined,
): Promise<Gloat | null> {
	if (!gloat) return null
	if (!ctx.user) return gloat
	const blocked = await viewerBlockedIdsLoader(ctx).load(ctx.user.id)
	return blocked.has(gloat.senderId) ? null : gloat
}

const creatorGloatOf = async (ctx: Context, view: ChallengeView) =>
	(await gloatsByChallengeLoader(ctx).load(view.challenge.id)).find(
		(g) => g.senderId === view.challenge.creatorId && g.acceptanceId === null,
	)

const GloatGifRef = builder.objectRef<KlipyGif>("GloatGif").implement({
	fields: (t) => ({
		// Klipy's slug for it.
		id: t.exposeID("id"),
		url: t.exposeString("url"),
		// A smaller rendition, for the picker's grid.
		previewUrl: t.exposeString("previewUrl"),
		width: t.exposeInt("width"),
		height: t.exposeInt("height"),
		alt: t.exposeString("alt"),
	}),
})

export const GloatRef = builder.objectRef<Gloat>("Gloat").implement({
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({ type: "DateTime", resolve: (g) => g.createdAt }),
		sender: t.field({
			type: UserRef,
			resolve: async (g) => {
				const user = await db.query.users.findFirst({
					where: { id: g.senderId },
				})
				if (!user) throw new Error("Gloat sender missing")
				return user
			},
		}),
		// Taken down off a report. Its text and GIF are null from then on.
		removed: t.boolean({ resolve: (g) => g.removedAt !== null }),
		text: t.string({
			nullable: true,
			resolve: (g) => (g.removedAt ? null : g.text),
		}),
		gif: t.field({
			type: GloatGifRef,
			nullable: true,
			resolve: (g) =>
				g.removedAt || !g.gifId || !g.gifUrl || !g.gifWidth || !g.gifHeight
					? null
					: {
							id: g.gifId,
							url: g.gifUrl,
							previewUrl: g.gifUrl,
							width: g.gifWidth,
							height: g.gifHeight,
							alt: g.gifAlt ?? "",
						},
		}),
	}),
})

builder.objectFields(ChallengeRef, (t) => ({
	// The creator's gloat, which goes to everyone they beat.
	creatorGloat: t.field({
		type: GloatRef,
		nullable: true,
		resolve: async (c, _args, ctx) =>
			visibleGloat(
				ctx,
				await creatorGloatOf(ctx, await challengeViewLoader(ctx).load(c)),
			),
	}),
	// Whether the viewer won something here and hasn't gloated about it yet.
	viewerCanGloat: t.boolean({
		resolve: async (c, _args, ctx) => {
			if (!ctx.user) return false
			const view = await challengeViewLoader(ctx).load(c)
			if (view.state !== "settled") return false
			return canGloat(ctx.user, c)
		},
	}),
}))

builder.objectFields(ChallengeMatchupRef, (t) => ({
	// The creator's gloat, on a 1v1 they won.
	creatorGloat: t.field({
		type: GloatRef,
		nullable: true,
		resolve: async (p, _args, ctx) =>
			p.matchup.outcome === "creator"
				? visibleGloat(ctx, await creatorGloatOf(ctx, p.view))
				: null,
	}),
	// The acceptor's gloat, on a 1v1 they won.
	acceptorGloat: t.field({
		type: GloatRef,
		nullable: true,
		resolve: async (p, _args, ctx) => {
			if (p.matchup.outcome !== "acceptor") return null
			const all = await gloatsByChallengeLoader(ctx).load(p.view.challenge.id)
			return visibleGloat(
				ctx,
				all.find((g) => g.acceptanceId === p.matchup.acceptance.id),
			)
		},
	}),
}))

export const GloatReportRef = builder
	.objectRef<GloatReport>("GloatReport")
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
			gloat: t.field({
				type: GloatRef,
				resolve: async (r) => {
					const gloat = await db.query.comments.findFirst({
						where: { id: r.commentId },
					})
					if (!gloat) throw new Error("Reported gloat missing")
					return gloat
				},
			}),
			// Where the gloat was sent, for the admin to read it in place.
			challengeCode: t.string({
				resolve: async (r) => {
					const gloat = await db.query.comments.findFirst({
						where: { id: r.commentId },
						with: { challenge: { columns: { code: true } } },
					})
					return gloat?.challenge?.code ?? ""
				},
			}),
		}),
	})

const GloatPayload = builder
	.objectRef<{ gloat: Gloat }>("GloatSentPayload")
	.implement({
		fields: (t) => ({
			gloat: t.field({ type: GloatRef, resolve: (p) => p.gloat }),
		}),
	})

const GloatReportPayload = builder
	.objectRef<{ report: GloatReport }>("GloatReportPayload")
	.implement({
		fields: (t) => ({
			report: t.field({ type: GloatReportRef, resolve: (p) => p.report }),
		}),
	})

const GloatGifInput = builder.inputType("GloatGifInput", {
	fields: (t) => ({
		id: t.id({ required: true }),
		url: t.string({ required: true }),
		width: t.int({ required: true }),
		height: t.int({ required: true }),
		alt: t.string({ required: false }),
	}),
})

const SendChallengeGloatInput = builder.inputType("SendChallengeGloatInput", {
	fields: (t) => ({
		challengeId: t.id({ required: true }),
		text: t.string({ required: false }),
		gif: t.field({ type: GloatGifInput, required: false }),
	}),
})

const ReportGloatInput = builder.inputType("ReportGloatInput", {
	fields: (t) => ({
		gloatId: t.id({ required: true }),
		reason: t.field({ type: PresserReportReasonEnum, required: true }),
		details: t.string({ required: false }),
	}),
})

const GLOAT_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

builder.queryFields((t) => ({
	// Whether GIFs can be picked at all here. False when no Klipy key is set.
	gifsEnabled: t.boolean({ resolve: () => isKlipyConfigured() }),

	// GIFs for a gloat, by search, or what's trending without one. Signed in
	// only, and limited per person per minute.
	gifSearch: t.field({
		type: [GloatGifRef],
		args: {
			query: t.arg.string({ required: false }),
			page: t.arg.int({ required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			if (!allowGifSearch(user.id)) {
				throw ValidationError.field(null, "Slow down a little.")
			}
			const page = Math.max(1, args.page ?? 1)
			const query = args.query?.trim() ?? ""
			try {
				return query
					? await searchGifs({ query, page, userId: user.id })
					: await trendingGifs({ page, userId: user.id })
			} catch {
				return []
			}
		},
	}),

	// Open reports on gloats, oldest first. Only challenge comments: every
	// report, chain comments included, is on adminCommentReports.
	adminGloatReports: t.field({
		type: [GloatReportRef],
		deprecationReason: "Use adminCommentReports.",
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return db
				.select({ report: commentReports })
				.from(commentReports)
				.innerJoin(comments, eq(comments.id, commentReports.commentId))
				.where(
					and(
						eq(commentReports.status, "open"),
						isNotNull(comments.challengeId),
					),
				)
				.orderBy(commentReports.createdAt)
				.then((rows) => rows.map((row) => row.report))
		},
	}),
}))

builder.mutationFields((t) => ({
	sendChallengeGloat: t.field({
		type: GloatPayload,
		errors: {
			types: [...GLOAT_ERRORS],
			directResult: true,
			union: { name: "SendChallengeGloatResult" },
		},
		args: { input: t.arg({ type: SendChallengeGloatInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const gif = args.input.gif
			const gloat = await sendChallengeGloat(
				user,
				String(args.input.challengeId),
				{
					text: args.input.text ?? "",
					gif: gif
						? {
								id: String(gif.id),
								url: gif.url,
								width: gif.width,
								height: gif.height,
								alt: gif.alt ?? "",
							}
						: null,
				},
			)
			return { gloat }
		},
	}),

	reportGloat: t.field({
		type: GloatReportPayload,
		errors: {
			types: [...GLOAT_ERRORS],
			directResult: true,
			union: { name: "ReportGloatResult" },
		},
		args: { input: t.arg({ type: ReportGloatInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const report = await reportComment(user, {
				commentId: String(args.input.gloatId),
				reason: args.input.reason,
				details: args.input.details ?? "",
			})
			return { report }
		},
	}),

	adminDismissGloatReport: t.field({
		type: GloatReportPayload,
		deprecationReason: "Use adminDismissCommentReport.",
		errors: {
			types: [...GLOAT_ERRORS],
			directResult: true,
			union: { name: "AdminDismissGloatReportResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return {
				report: await dismissCommentReport(admin, String(args.reportId)),
			}
		},
	}),

	// Takes the reported gloat down and closes every open report on it.
	adminRemoveGloat: t.field({
		type: GloatReportPayload,
		deprecationReason: "Use adminRemoveComment.",
		errors: {
			types: [...GLOAT_ERRORS],
			directResult: true,
			union: { name: "AdminRemoveGloatResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return { report: await removeComment(admin, String(args.reportId)) }
		},
	}),
}))

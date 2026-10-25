import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { type PostReport, postReports } from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import {
	dismissPostReport,
	removePost,
	removePrompt,
	reportPost,
} from "../../../lib/posts/reports"
import { builder } from "../../builder"
import { PresserReportReasonEnum } from "../presser/refs"
import { UserRef } from "../user"
import { PostInterfaceRef } from "./refs"

export const PostReportRef = builder
	.objectRef<PostReport>("PostReport")
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
			// The post as reported, taken down or not, with its prompt's title
			// on RushmorePost.prompt for a report about the prompt itself.
			post: t.field({
				type: PostInterfaceRef,
				resolve: async (r) => {
					const post = await db.query.posts.findFirst({
						where: { id: r.postId },
					})
					if (!post) throw new Error("Reported post missing")
					return post
				},
			}),
		}),
	})

const PostReportPayload = builder
	.objectRef<{ report: PostReport }>("PostReportPayload")
	.implement({
		fields: (t) => ({
			report: t.field({ type: PostReportRef, resolve: (p) => p.report }),
		}),
	})

const ReportPostInput = builder.inputType("ReportPostInput", {
	fields: (t) => ({
		postId: t.id({ required: true }),
		reason: t.field({ type: PresserReportReasonEnum, required: true }),
		details: t.string({ required: false }),
	}),
})

const REPORT_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

const errors = (name: string) => ({
	types: [...REPORT_ERRORS],
	directResult: true as const,
	union: { name },
})

builder.queryFields((t) => ({
	// Open reports on posts, oldest first.
	adminPostReports: t.field({
		type: [PostReportRef],
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return db
				.select()
				.from(postReports)
				.where(eq(postReports.status, "open"))
				.orderBy(postReports.createdAt)
		},
	}),
}))

builder.mutationFields((t) => ({
	reportPost: t.field({
		type: PostReportPayload,
		errors: errors("ReportPostResult"),
		args: { input: t.arg({ type: ReportPostInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const report = await reportPost(user, {
				postId: String(args.input.postId),
				reason: args.input.reason,
				details: args.input.details ?? "",
			})
			return { report }
		},
	}),

	adminDismissPostReport: t.field({
		type: PostReportPayload,
		errors: errors("AdminDismissPostReportResult"),
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return { report: await dismissPostReport(admin, String(args.reportId)) }
		},
	}),

	// Takes the reported post down and closes every open report on it.
	adminRemovePost: t.field({
		type: PostReportPayload,
		errors: errors("AdminRemovePostResult"),
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return { report: await removePost(admin, String(args.reportId)) }
		},
	}),

	// Takes down the prompt the reported post answers, and every answer with
	// it, closing their open reports.
	adminRemovePrompt: t.field({
		type: PostReportPayload,
		errors: errors("AdminRemovePromptResult"),
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return { report: await removePrompt(admin, String(args.reportId)) }
		},
	}),
}))

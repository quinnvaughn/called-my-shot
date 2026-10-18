import { eq } from "drizzle-orm"
import { db } from "../../../db"
import { type CommentReport, commentReports } from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import {
	dismissCommentReport,
	removeComment,
	reportComment,
} from "../../../lib/comments/reports"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import { builder } from "../../builder"
import { PresserReportReasonEnum } from "../presser/refs"
import { CommentReportRef } from "./refs"

const CommentReportPayload = builder
	.objectRef<{ report: CommentReport }>("CommentReportPayload")
	.implement({
		fields: (t) => ({
			report: t.field({ type: CommentReportRef, resolve: (p) => p.report }),
		}),
	})

const ReportCommentInput = builder.inputType("ReportCommentInput", {
	fields: (t) => ({
		commentId: t.id({ required: true }),
		reason: t.field({ type: PresserReportReasonEnum, required: true }),
		details: t.string({ required: false }),
	}),
})

const COMMENT_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

builder.queryFields((t) => ({
	// Open reports on every comment, gloats and chain threads alike, oldest
	// first.
	adminCommentReports: t.field({
		type: [CommentReportRef],
		resolve: (_root, _args, ctx) => {
			requireAdmin(ctx)
			return db
				.select()
				.from(commentReports)
				.where(eq(commentReports.status, "open"))
				.orderBy(commentReports.createdAt)
		},
	}),
}))

builder.mutationFields((t) => ({
	reportComment: t.field({
		type: CommentReportPayload,
		errors: {
			types: [...COMMENT_ERRORS],
			directResult: true,
			union: { name: "ReportCommentResult" },
		},
		args: { input: t.arg({ type: ReportCommentInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const report = await reportComment(user, {
				commentId: String(args.input.commentId),
				reason: args.input.reason,
				details: args.input.details ?? "",
			})
			return { report }
		},
	}),

	adminDismissCommentReport: t.field({
		type: CommentReportPayload,
		errors: {
			types: [...COMMENT_ERRORS],
			directResult: true,
			union: { name: "AdminDismissCommentReportResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return {
				report: await dismissCommentReport(admin, String(args.reportId)),
			}
		},
	}),

	// Takes the reported comment down and closes every open report on it.
	adminRemoveComment: t.field({
		type: CommentReportPayload,
		errors: {
			types: [...COMMENT_ERRORS],
			directResult: true,
			union: { name: "AdminRemoveCommentResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return { report: await removeComment(admin, String(args.reportId)) }
		},
	}),
}))

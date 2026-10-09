import {
	answerPresserQuestionSchema,
	askPresserQuestionSchema,
	postPresserStatementSchema,
	reportPresserContentSchema,
} from "@called-my-shot/schemas"
import type { PresserReport } from "../../../db/schema"
import { requireAdmin, requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
} from "../../../lib/errors"
import {
	answerPresserQuestion,
	askPresserQuestion,
	blockUser,
	dismissPresserReport,
	postPresserStatement,
	removePresserContent,
	reportPresserContent,
	unblockUser,
} from "../../../lib/pressers/actions"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"
import { UserRef } from "../user"
import {
	PresserRef,
	PresserReportReasonEnum,
	PresserReportRef,
	PresserReportTargetEnum,
} from "./refs"

const PresserPayload = builder
	.objectRef<{ presser: typeof PresserRef.$inferType }>("PresserPayload")
	.implement({
		fields: (t) => ({
			presser: t.field({ type: PresserRef, resolve: (p) => p.presser }),
		}),
	})

const PresserReportPayload = builder
	.objectRef<{ report: PresserReport }>("PresserReportPayload")
	.implement({
		fields: (t) => ({
			report: t.field({ type: PresserReportRef, resolve: (p) => p.report }),
		}),
	})

const BlockPayload = builder
	.objectRef<{ user: typeof UserRef.$inferType; blocked: boolean }>(
		"BlockPayload",
	)
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (p) => p.user }),
			blocked: t.exposeBoolean("blocked"),
		}),
	})

const PostPresserStatementInput = builder.inputType(
	"PostPresserStatementInput",
	{
		fields: (t) => ({
			presserId: t.id({ required: true }),
			text: t.string({ required: true }),
		}),
	},
)

const AskPresserQuestionInput = builder.inputType("AskPresserQuestionInput", {
	fields: (t) => ({
		presserId: t.id({ required: true }),
		body: t.string({ required: true }),
	}),
})

const AnswerPresserQuestionInput = builder.inputType(
	"AnswerPresserQuestionInput",
	{
		fields: (t) => ({
			questionId: t.id({ required: true }),
			answer: t.string({ required: false }),
			noComment: t.boolean({ required: false }),
		}),
	},
)

const ReportPresserContentInput = builder.inputType(
	"ReportPresserContentInput",
	{
		fields: (t) => ({
			presserId: t.id({ required: true }),
			presserQuestionId: t.id({ required: false }),
			target: t.field({ type: PresserReportTargetEnum, required: true }),
			reason: t.field({ type: PresserReportReasonEnum, required: true }),
			details: t.string({ required: false }),
		}),
	},
)

const PRESSER_ERRORS = [
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
] as const

builder.mutationFields((t) => ({
	// The owner's one opening statement, while the presser is open.
	postPresserStatement: t.field({
		type: PresserPayload,
		errors: {
			types: [...PRESSER_ERRORS],
			directResult: true,
			union: { name: "PostPresserStatementResult" },
		},
		args: { input: t.arg({ type: PostPresserStatementInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(postPresserStatementSchema, args.input)
			return { presser: await postPresserStatement(user, input) }
		},
	}),

	// One question per asker per presser - see askEligibility for who can.
	askPresserQuestion: t.field({
		type: PresserPayload,
		errors: {
			types: [...PRESSER_ERRORS],
			directResult: true,
			union: { name: "AskPresserQuestionResult" },
		},
		args: { input: t.arg({ type: AskPresserQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(askPresserQuestionSchema, args.input)
			return { presser: await askPresserQuestion(user, input) }
		},
	}),

	// A written answer or "No comment". Either makes the question public, and
	// neither can be changed after.
	answerPresserQuestion: t.field({
		type: PresserPayload,
		errors: {
			types: [...PRESSER_ERRORS],
			directResult: true,
			union: { name: "AnswerPresserQuestionResult" },
		},
		args: {
			input: t.arg({ type: AnswerPresserQuestionInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(answerPresserQuestionSchema, {
				questionId: args.input.questionId,
				answer: args.input.answer ?? "",
				noComment: args.input.noComment ?? false,
			})
			return { presser: await answerPresserQuestion(user, input) }
		},
	}),

	reportPresserContent: t.field({
		type: PresserReportPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "ReportPresserContentResult" },
		},
		args: {
			input: t.arg({ type: ReportPresserContentInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(reportPresserContentSchema, {
				...args.input,
				details: args.input.details ?? "",
			})
			return { report: await reportPresserContent(user, input) }
		},
	}),

	// Neither side can ask the other a question after this.
	blockUser: t.field({
		type: BlockPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "BlockUserResult" },
		},
		args: { username: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return { user: await blockUser(user, args.username), blocked: true }
		},
	}),

	unblockUser: t.field({
		type: BlockPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "UnblockUserResult" },
		},
		args: { username: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return { user: await unblockUser(user, args.username), blocked: false }
		},
	}),

	adminDismissPresserReport: t.field({
		type: PresserReportPayload,
		errors: {
			types: [...PRESSER_ERRORS],
			directResult: true,
			union: { name: "AdminDismissPresserReportResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return {
				report: await dismissPresserReport(admin, String(args.reportId)),
			}
		},
	}),

	// Takes the reported statement, question or answer down, and closes every
	// open report on it.
	adminRemovePresserContent: t.field({
		type: PresserReportPayload,
		errors: {
			types: [...PRESSER_ERRORS],
			directResult: true,
			union: { name: "AdminRemovePresserContentResult" },
		},
		args: { reportId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			return {
				report: await removePresserContent(admin, String(args.reportId)),
			}
		},
	}),
}))

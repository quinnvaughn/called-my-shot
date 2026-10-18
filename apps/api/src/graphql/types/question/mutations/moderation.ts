import {
	adminMarkQuestionVoidedSchema,
	deleteQuestionSchema,
	editQuestionTitleSchema,
	reportQuestionSchema,
	voidQuestionSchema,
} from "@called-my-shot/schemas"
import { eq, sql } from "drizzle-orm"
import { db } from "../../../../db"
import {
	questionReports,
	questions,
	questionVoids,
	users,
} from "../../../../db/schema"
import { requireAdmin, requireUser } from "../../../../lib/auth"
import { drainChainsNow } from "../../../../lib/chains/drain"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { createNotification } from "../../../../lib/notifications"
import { reverseQuestionLeagueStats } from "../../../../lib/resolve-question"
import { markSettleFollowups } from "../../../../lib/settle-followups"
import { STRIKE_LOCK_THRESHOLD } from "../../../../lib/strikes"
import { markQuestionVoided } from "../../../../lib/void-question"
import { builder } from "../../../builder"
import { lockOrThrow, parseInput } from "../../../helpers"
import {
	AdminMarkQuestionVoidedInput,
	DeleteQuestionInput,
	DeleteQuestionPayload,
	DismissReportInput,
	EditQuestionTitleInput,
	QuestionPayload,
	ReportQuestionInput,
	ReportQuestionPayload,
	VoidQuestionInput,
	VoidQuestionPayload,
} from "../inputs"
import { QuestionReportRef } from "../moderation-objects"
import { assertLocked } from "./guards"

builder.mutationFields((t) => ({
	// Dismiss = admin looked at the report and decided the question is fine as
	// is. Doesn't touch the question itself - if it actually needs to come
	// down, that's a separate Void action (same escalation path the Disputes
	// page already offers), not something this mutation does on its own.
	dismissReport: t.field({
		type: QuestionReportRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "DismissReportResult" },
		},
		args: { input: t.arg({ type: DismissReportInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			return db.transaction(async (tx) => {
				const report = await lockOrThrow(
					tx,
					questionReports,
					args.input.reportId,
					"Report not found",
				)
				if (report.status !== "open") {
					throw ValidationError.field(null, "This report is already settled.")
				}

				const [updatedReport] = await tx
					.update(questionReports)
					.set({ status: "dismissed", reviewedAt: new Date() })
					.where(eq(questionReports.id, report.id))
					.returning()
				if (!updatedReport)
					throw new Error("dismissReport: report vanished mid-transaction")

				return updatedReport
			})
		},
	}),

	// title is always creator-supplied free text (generateQuestionTitle only
	// prefills a suggestion client-side - see the comment on title in
	// createQuestionSchema) - this just lets an admin fix a typo or awkward
	// wording after the fact, without having to void and recreate the whole
	// question.
	editQuestionTitle: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "EditQuestionTitleResult" },
		},
		args: { input: t.arg({ type: EditQuestionTitleInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const { questionId, title } = parseInput(
				editQuestionTitleSchema,
				args.input,
			)

			const [updated] = await db
				.update(questions)
				.set({ title })
				.where(eq(questions.id, questionId))
				.returning()
			if (!updated) throw new NotFoundError("Question not found")
			return { question: updated }
		},
	}),

	// Official-only counterpart to voidQuestion - a user-generated question
	// always goes through Void instead, since that's what preserves the audit
	// trail and strike bookkeeping a real asker's question needs (see
	// questionVoids and the comment above voidQuestion below). An official
	// question has no asker to strike and no dispute-worthy audit trail, so a
	// hard delete is the right tool when one was posted in error (wrong game,
	// duplicate sync, bad award setup).
	deleteQuestion: t.field({
		type: DeleteQuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "DeleteQuestionResult" },
		},
		args: { input: t.arg({ type: DeleteQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)
			const { questionId } = parseInput(deleteQuestionSchema, args.input)

			await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					questionId,
					"Question not found",
				)
				if (!question.isOfficial) {
					throw ValidationError.field(
						null,
						"Only official questions can be deleted this way - void a user-generated question instead.",
					)
				}

				await reverseQuestionLeagueStats(tx, question)
				await markSettleFollowups(tx, question)
				await tx.delete(questions).where(eq(questions.id, question.id))
			})
			await drainChainsNow()

			return { questionId }
		},
	}),

	// Void = delete the question and everything on it (calls, options,
	// disputes all cascade). reverseQuestionLeagueStats always runs first -
	// callCount needs decrementing for every caller even on an open question
	// (calls can already exist pre-resolution), while points/resolvedCallCount/
	// correctCount only come out non-zero for a disputed question (the only
	// status that already went through resolveQuestionInternal once) - before
	// the cascade delete removes the only rows that recorded any of it.
	// questionVoids keeps the audit trail (Users tab's void history, and the
	// strike bookkeeping below) that the hard delete would otherwise erase.
	voidQuestion: t.field({
		type: VoidQuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "VoidQuestionResult" },
		},
		args: { input: t.arg({ type: VoidQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const data = parseInput(voidQuestionSchema, args.input)

			await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					data.questionId,
					"Question not found",
				)
				if (question.status === "resolved") {
					throw ValidationError.field(
						null,
						"Only a live, locked, or disputed question can be voided.",
					)
				}

				if (question.creatorId) {
					await tx.insert(questionVoids).values({
						questionId: question.id,
						questionTitle: question.title,
						targetUserId: question.creatorId,
						voidedByAdminId: admin.id,
						reason: data.reason,
						duplicateOfQuestionId: data.duplicateOfQuestionId,
						note: data.note || null,
						countsAsStrike: data.countsAsStrike,
					})

					let strikeCount: number | undefined
					if (data.countsAsStrike) {
						const [updatedUser] = await tx
							.update(users)
							.set({ strikeCount: sql`${users.strikeCount} + 1` })
							.where(eq(users.id, question.creatorId))
							.returning()
						if (updatedUser) {
							strikeCount = updatedUser.strikeCount
							if (
								updatedUser.strikeCount >= STRIKE_LOCK_THRESHOLD &&
								updatedUser.questionCreationEnabled
							) {
								await tx
									.update(users)
									.set({ questionCreationEnabled: false })
									.where(eq(users.id, question.creatorId))
							}
						}
					}

					await createNotification(tx, {
						type: "question_voided",
						userId: question.creatorId,
						questionId: question.id,
						questionTitle: question.title,
						strikeCount,
					})
				}

				await reverseQuestionLeagueStats(tx, question)
				await markSettleFollowups(tx, question)

				await tx.delete(questions).where(eq(questions.id, question.id))
			})
			await drainChainsNow()

			return { questionId: data.questionId }
		},
	}),

	// Distinct from fileDispute above: a report flags the question itself as
	// bad (nonsensical, off-topic, a duplicate, ...), not a resolution as
	// wrong, so it's open to any signed-in caller regardless of question
	// status, not just resolved ones a viewer actually called on.
	reportQuestion: t.field({
		type: ReportQuestionPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "ReportQuestionResult" },
		},
		args: { input: t.arg({ type: ReportQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const data = parseInput(reportQuestionSchema, args.input)

			// Checked under the question's row lock, so a double-submitted report
			// can't pass the duplicate check twice before either is written.
			const report = await db.transaction(async (tx) => {
				await lockOrThrow(tx, questions, data.questionId, "Question not found")

				const existingReport = await tx.query.questionReports.findFirst({
					where: {
						questionId: data.questionId,
						reportedByUserId: user.id,
					},
				})
				if (existingReport) {
					throw ValidationError.field(
						null,
						"You've already reported this question.",
					)
				}

				const [report] = await tx
					.insert(questionReports)
					.values({
						questionId: data.questionId,
						reportedByUserId: user.id,
						reason: data.reason,
						details: data.details || null,
						status: "open",
					})
					.returning()
				if (!report) throw new Error("reportQuestion: insert returned no row")
				return report
			})

			return { report }
		},
	}),

	// Voids a question with no result and nobody at fault - see
	// markQuestionVoided. For what the automatic resolver can't settle on its
	// own: a player ESPN doesn't list, a game that never finished. Allowed once
	// the question has locked, resolved ones included; an open dispute has to
	// be settled first, since upholding it would put the question back to
	// resolved.
	adminMarkQuestionVoided: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminMarkQuestionVoidedResult" },
		},
		args: {
			input: t.arg({ type: AdminMarkQuestionVoidedInput, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)
			const data = parseInput(adminMarkQuestionVoidedSchema, args.input)

			const question = await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					data.questionId,
					"Question not found",
				)
				if (question.status === "disputed") {
					throw ValidationError.field(
						null,
						"Settle the open dispute before voiding this question.",
					)
				}
				if (question.status === "voided") {
					throw ValidationError.field(null, "This question is already voided.")
				}
				assertLocked(question)

				return markQuestionVoided(tx, question, {
					reason: data.reason,
					note: data.note,
					voidedBy: { method: "admin", userId: admin.id },
				})
			})
			await drainChainsNow()

			return { question }
		},
	}),
}))

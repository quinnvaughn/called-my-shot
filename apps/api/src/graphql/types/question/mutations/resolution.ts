import {
	adminResolveQuestionSchema,
	fileDisputeSchema,
	resolveQuestionSchema,
} from "@called-my-shot/schemas"
import { eq } from "drizzle-orm"
import { db } from "../../../../db"
import { calls, questions, resolutionDisputes } from "../../../../db/schema"
import { requireAdmin, requireUser } from "../../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { createNotification } from "../../../../lib/notifications"
import { resolveQuestionInternal } from "../../../../lib/resolve-question"
import { builder } from "../../../builder"
import {
	AdminResolveQuestionInput,
	FileDisputeInput,
	FileDisputePayload,
	OverturnDisputeInput,
	QuestionPayload,
	ResolveQuestionInput,
	UpholdDisputeInput,
} from "../inputs"
import { ResolutionDisputeRef } from "../moderation-objects"

builder.mutationFields((t) => ({
	resolveQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "ResolveQuestionResult" },
		},
		args: { input: t.arg({ type: ResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, args.input.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.creatorId !== user.id) {
					throw new AuthorizationError(
						"Only the creator can resolve this question.",
					)
				}
				if (question.status === "voided") {
					throw ValidationError.field(null, "This question was voided.")
				}
				if (question.resolutionMode === "system") {
					throw ValidationError.field(
						null,
						"This question resolves automatically from ESPN.",
					)
				}
				if (question.status === "resolved" || question.status === "disputed") {
					throw ValidationError.field(
						null,
						"This question has already been resolved.",
					)
				}
				// Readiness is derived from locksAt, never trusted from status -
				// same reasoning as castCall above.
				if (question.locksAt > new Date()) {
					throw ValidationError.field(null, "This question hasn't locked yet.")
				}

				const parsed = resolveQuestionSchema.safeParse({
					...args.input,
					shape: question.shape,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				// A creator grading a question nobody else called has nobody who
				// could dispute the result, so their own call on it doesn't score.
				const callers = await tx
					.select({ userId: calls.userId })
					.from(calls)
					.where(eq(calls.questionId, question.id))
				const isSoleCaller =
					callers.length === 1 && callers[0]?.userId === user.id

				return resolveQuestionInternal(tx, question, parsed.data, {
					resolvedBy: { method: "creator", userId: user.id },
					...(isSoleCaller
						? {
								unscoredUserIds: new Map([
									[user.id, "creator_sole_caller" as const],
								]),
							}
						: {}),
				})
			})

			return { question }
		},
	}),

	// Admin-only counterpart to resolveQuestion above, for a question whose
	// creator never got around to resolving it (the Queue tab's "needs
	// resolution" list). Same eligibility rule as the creator path (open,
	// locksAt already passed) except there's no creator check - any admin can
	// resolve any question - and it can additionally overwrite the
	// creation-time resolutionSource/resolutionSourceUrl with what the admin
	// actually checked.
	adminResolveQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "AdminResolveQuestionResult" },
		},
		args: { input: t.arg({ type: AdminResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, args.input.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.status === "resolved" || question.status === "disputed") {
					throw ValidationError.field(
						null,
						"This question has already been resolved.",
					)
				}
				if (question.locksAt > new Date()) {
					throw ValidationError.field(null, "This question hasn't locked yet.")
				}

				const parsed = adminResolveQuestionSchema.safeParse({
					...args.input,
					shape: question.shape,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				return resolveQuestionInternal(tx, question, parsed.data, {
					resolvedBy: { method: "admin", userId: admin.id },
					source: {
						resolutionSource: parsed.data.resolutionSource,
						resolutionSourceUrl: parsed.data.resolutionSourceUrl,
					},
				})
			})

			return { question }
		},
	}),

	// Disputes tab's Overturn action - re-runs resolution with a corrected
	// outcome and closes the dispute as overturned. Requires the dispute still
	// be open and its question still disputed (both should always move
	// together, but each is checked independently rather than assumed from
	// the other).
	overturnDispute: t.field({
		type: QuestionPayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "OverturnDisputeResult" },
		},
		args: { input: t.arg({ type: OverturnDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const [dispute] = await tx
					.select()
					.from(resolutionDisputes)
					.where(eq(resolutionDisputes.id, args.input.disputeId))
					.for("update")
				if (!dispute) throw new NotFoundError("Dispute not found")
				if (dispute.status !== "open") {
					throw ValidationError.field(null, "This dispute is already settled.")
				}

				const [question] = await tx
					.select()
					.from(questions)
					.where(eq(questions.id, dispute.questionId))
					.for("update")
				if (!question) throw new NotFoundError("Question not found")
				if (question.status !== "disputed") {
					throw ValidationError.field(null, "This question isn't disputed.")
				}

				const parsed = adminResolveQuestionSchema.safeParse({
					...args.input.resolution,
					shape: question.shape,
				})
				if (!parsed.success) {
					throw ValidationError.fromZodIssues(parsed.error.issues)
				}

				const updated = await resolveQuestionInternal(
					tx,
					question,
					parsed.data,
					{
						resolvedBy: { method: "admin", userId: admin.id },
						source: {
							resolutionSource: parsed.data.resolutionSource,
							resolutionSourceUrl: parsed.data.resolutionSourceUrl,
						},
					},
				)

				await tx
					.update(resolutionDisputes)
					.set({ status: "overturned", resolvedAt: new Date() })
					.where(eq(resolutionDisputes.id, dispute.id))

				await createNotification(tx, {
					type: "dispute_overturned",
					userId: dispute.userId,
					questionId: question.id,
					questionTitle: question.title,
					disputeId: dispute.id,
				})

				return updated
			})

			return { question }
		},
	}),

	// Disputes tab's Uphold action - keeps the original resolution as-is,
	// just closes the dispute. resolutionNote here is the dispute's own note
	// field (shown as the dispute's resolution context), distinct from the
	// question's own resolutionNote which this leaves untouched.
	upholdDispute: t.field({
		type: ResolutionDisputeRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpholdDisputeResult" },
		},
		args: { input: t.arg({ type: UpholdDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			requireAdmin(ctx)

			return db.transaction(async (tx) => {
				const [dispute] = await tx
					.select()
					.from(resolutionDisputes)
					.where(eq(resolutionDisputes.id, args.input.disputeId))
					.for("update")
				if (!dispute) throw new NotFoundError("Dispute not found")
				if (dispute.status !== "open") {
					throw ValidationError.field(null, "This dispute is already settled.")
				}

				const [updatedDispute] = await tx
					.update(resolutionDisputes)
					.set({
						status: "upheld",
						resolvedAt: new Date(),
						resolutionNote: args.input.note || null,
					})
					.where(eq(resolutionDisputes.id, dispute.id))
					.returning()
				if (!updatedDispute)
					throw new Error("upholdDispute: dispute vanished mid-transaction")

				await tx
					.update(questions)
					.set({ status: "resolved" })
					.where(eq(questions.id, dispute.questionId))

				const question = await tx.query.questions.findFirst({
					where: { id: dispute.questionId },
					columns: { title: true },
				})
				if (!question)
					throw new Error("upholdDispute: question vanished mid-transaction")

				await createNotification(tx, {
					type: "dispute_upheld",
					userId: dispute.userId,
					questionId: dispute.questionId,
					questionTitle: question.title,
					disputeId: dispute.id,
				})

				return updatedDispute
			})
		},
	}),

	fileDispute: t.field({
		type: FileDisputePayload,
		errors: {
			types: [
				AuthenticationError,
				AuthorizationError,
				NotFoundError,
				ValidationError,
			],
			directResult: true,
			union: { name: "FileDisputeResult" },
		},
		args: { input: t.arg({ type: FileDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const parsed = fileDisputeSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			const question = await db.query.questions.findFirst({
				where: { id: data.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")
			if (question.status !== "resolved") {
				throw ValidationError.field(
					null,
					"Only resolved questions can be disputed.",
				)
			}

			const callerCall = await db.query.calls.findFirst({
				where: { questionId: data.questionId, userId: user.id },
			})
			if (!callerCall) {
				throw new AuthorizationError(
					"Only callers on this question can dispute its resolution.",
				)
			}

			const existingDispute = await db.query.resolutionDisputes.findFirst({
				where: { questionId: data.questionId, userId: user.id },
			})
			if (existingDispute) {
				throw ValidationError.field(
					null,
					"You've already disputed this question.",
				)
			}

			const settledDispute = await db.query.resolutionDisputes.findFirst({
				where: {
					questionId: data.questionId,
					status: { in: ["upheld", "overturned"] },
				},
			})
			if (settledDispute) {
				throw ValidationError.field(
					null,
					"This question's resolution has already been reviewed and is final.",
				)
			}

			const dispute = await db.transaction(async (tx) => {
				const [dispute] = await tx
					.insert(resolutionDisputes)
					.values({
						questionId: data.questionId,
						userId: user.id,
						reason: data.reason,
						status: "open",
					})
					.returning()
				await tx
					.update(questions)
					.set({ status: "disputed" })
					.where(eq(questions.id, data.questionId))

				if (question.creatorId && question.creatorId !== user.id) {
					await createNotification(tx, {
						type: "dispute_filed",
						userId: question.creatorId,
						questionId: question.id,
						questionTitle: question.title,
						actorId: user.id,
						actorUsername: user.username,
						disputeId: dispute.id,
					})
				}

				return dispute
			})

			return { dispute }
		},
	}),
}))

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
import { lockOrThrow, parseInput } from "../../../helpers"
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
import { assertLocked, assertUnresolved, lockOpenDispute } from "./guards"

// What an admin's resolution records beyond the outcome itself: who set it,
// and the source they actually checked in place of the creation-time one.
function adminResolution(
	adminId: string,
	resolution: { resolutionSource?: string; resolutionSourceUrl?: string },
) {
	return {
		resolvedBy: { method: "admin" as const, userId: adminId },
		source: {
			resolutionSource: resolution.resolutionSource,
			resolutionSourceUrl: resolution.resolutionSourceUrl,
		},
	}
}

builder.mutationFields((t) => ({
	resolveQuestion: t.field({
		type: QuestionPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "ResolveQuestionResult" },
		},
		args: { input: t.arg({ type: ResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const question = await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					args.input.questionId,
					"Question not found",
				)
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
				assertUnresolved(question)
				assertLocked(question)

				const resolution = parseInput(resolveQuestionSchema, {
					...args.input,
					shape: question.shape,
				})

				// A creator grading a question nobody else called has nobody who
				// could dispute the result, so their own call on it doesn't score.
				const callers = await tx
					.select({ userId: calls.userId })
					.from(calls)
					.where(eq(calls.questionId, question.id))
				const isSoleCaller =
					callers.length === 1 && callers[0]?.userId === user.id

				return resolveQuestionInternal(tx, question, resolution, {
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
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "AdminResolveQuestionResult" },
		},
		args: { input: t.arg({ type: AdminResolveQuestionInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					args.input.questionId,
					"Question not found",
				)
				assertUnresolved(question)
				assertLocked(question)

				const resolution = parseInput(adminResolveQuestionSchema, {
					...args.input,
					shape: question.shape,
				})

				return resolveQuestionInternal(
					tx,
					question,
					resolution,
					adminResolution(admin.id, resolution),
				)
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
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "OverturnDisputeResult" },
		},
		args: { input: t.arg({ type: OverturnDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const admin = requireAdmin(ctx)

			const question = await db.transaction(async (tx) => {
				const dispute = await lockOpenDispute(tx, args.input.disputeId)
				const question = await lockOrThrow(
					tx,
					questions,
					dispute.questionId,
					"Question not found",
				)
				if (question.status !== "disputed") {
					throw ValidationError.field(null, "This question isn't disputed.")
				}

				const resolution = parseInput(adminResolveQuestionSchema, {
					...args.input.resolution,
					shape: question.shape,
				})

				const updated = await resolveQuestionInternal(
					tx,
					question,
					resolution,
					adminResolution(admin.id, resolution),
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
				const dispute = await lockOpenDispute(tx, args.input.disputeId)

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
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "FileDisputeResult" },
		},
		args: { input: t.arg({ type: FileDisputeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const data = parseInput(fileDisputeSchema, args.input)

			// Checked under the question's row lock, so two disputes filed at
			// once can't both pass the checks below before either is written.
			const dispute = await db.transaction(async (tx) => {
				const question = await lockOrThrow(
					tx,
					questions,
					data.questionId,
					"Question not found",
				)
				if (question.status !== "resolved") {
					throw ValidationError.field(
						null,
						"Only resolved questions can be disputed.",
					)
				}

				const callerCall = await tx.query.calls.findFirst({
					where: { questionId: data.questionId, userId: user.id },
				})
				if (!callerCall) {
					throw new AuthorizationError(
						"Only callers on this question can dispute its resolution.",
					)
				}

				const existingDispute = await tx.query.resolutionDisputes.findFirst({
					where: { questionId: data.questionId, userId: user.id },
				})
				if (existingDispute) {
					throw ValidationError.field(
						null,
						"You've already disputed this question.",
					)
				}

				const settledDispute = await tx.query.resolutionDisputes.findFirst({
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

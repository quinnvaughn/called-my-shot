import { eq, inArray, sql } from "drizzle-orm"
import {
	callSelections,
	calls,
	type Question,
	type QuestionVoidedReason,
	questionOptions,
	questions,
} from "../db/schema"
import type { Tx } from "../db/types"
import { createNotifications } from "./notifications"
import { type ResolvedBy, reverseQuestionLeagueStats } from "./resolve-question"
import { markSettleFollowups } from "./settle-followups"

// Settles a question with no result instead of deleting it: every call stays
// visible but stops counting toward points, accuracy and call count, and the
// question reads as voided rather than resolved. For a question that can't be
// graded - its player never played, its game never finished - so unlike the
// moderation voidQuestion nobody is at fault: no question_voids row and no
// strike. Resolving the question later un-voids it (see
// resolveQuestionInternal). Same contract as resolveQuestionInternal: the
// caller has already locked the row and checked it's eligible.
export async function markQuestionVoided(
	tx: Tx,
	question: Question,
	input: {
		reason: QuestionVoidedReason
		note: string
		voidedBy: ResolvedBy
		// See ResolveOptions.holdNotices.
		holdNotices?: true
	},
): Promise<Question> {
	const questionCalls = await reverseQuestionLeagueStats(tx, question)

	if (questionCalls.length > 0) {
		await tx
			.update(calls)
			.set({
				resultPoints: null,
				hitTolerance: null,
				closenessMult: null,
				closenessFieldPct: null,
				// An existing reason is kept, so a creator_sole_caller exclusion is
				// still there if the question is later resolved again.
				unscoredReason: sql`coalesce(${calls.unscoredReason}, 'question_voided')`,
			})
			.where(eq(calls.questionId, question.id))
		await tx
			.update(callSelections)
			.set({ resultPoints: null })
			.where(
				inArray(
					callSelections.callId,
					questionCalls.map((c) => c.id),
				),
			)
	}
	await tx
		.update(questionOptions)
		.set({ isCorrect: null, actualValue: null })
		.where(eq(questionOptions.questionId, question.id))

	if (!input.holdNotices) {
		await createNotifications(
			tx,
			questionCalls.map((call) => ({
				type: "call_voided" as const,
				userId: call.userId,
				questionId: question.id,
				questionTitle: question.title,
			})),
		)
		await markSettleFollowups(tx, question)
	}

	const { voidedBy } = input
	const [updated] = await tx
		.update(questions)
		.set({
			status: "voided",
			voidedReason: input.reason,
			// When it was settled - a voided question has no result, but it did
			// stop waiting for one at this moment.
			resolvedAt: new Date(),
			resolutionNote: input.note || null,
			numericActualValue: null,
			resolutionMethod: voidedBy.method,
			resolvedByUserId: voidedBy.method === "system" ? null : voidedBy.userId,
		})
		.where(eq(questions.id, question.id))
		.returning()
	if (!updated)
		throw new Error("markQuestionVoided: question vanished mid-transaction")
	return updated
}

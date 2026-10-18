import { castCallSchema } from "@called-my-shot/schemas"
import { isNumericGuessShape, isSeasonLongShape } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { db } from "../../../../db"
import {
	callRedoSelections,
	callRedos,
	callSelections,
	calls,
	users,
} from "../../../../db/schema"
import { enqueueAnalyticsEvents } from "../../../../lib/analytics-outbox"
import { requireUser } from "../../../../lib/auth"
import { validateCallInput } from "../../../../lib/call-input"
import { selectionRows, seriesStageFields } from "../../../../lib/cast-call"
import {
	assertNoChainHedge,
	assertNotActiveLink,
} from "../../../../lib/chains/hedge"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { consumeRedoGrant, redoBalanceFor } from "../../../../lib/redos"
import { releaseWaitingReferral } from "../../../../lib/referrals"
import { builder } from "../../../builder"
import { lockOrThrow, parseInput } from "../../../helpers"
import { RedoCallInput, RedoCallPayload } from "../inputs"

builder.mutationFields((t) => ({
	// The one exception to calls being permanent, paid for with a redo earned
	// by inviting someone. The original isn't deleted: it's snapshotted onto
	// call_redos and shown alongside the replacement, which is what makes
	// "you redid a call that was already right" possible to see.
	redoCall: t.field({
		type: RedoCallPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "RedoCallResult" },
		},
		args: { input: t.arg({ type: RedoCallInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			return db.transaction(async (tx) => {
				// Taken first, and always before redo_grants. This is the
				// serialization point for the whole wallet: two redos fired at
				// once queue here rather than both reading the same balance.
				// qualifyReferralOnFirstCall locks the referrer's row in the
				// same order, so an inbound referral and an outbound redo
				// can't deadlock.
				await lockOrThrow(tx, users, user.id, "User not found")

				const call = await lockOrThrow(
					tx,
					calls,
					String(args.input.callId),
					"Call not found",
				)
				if (call.userId !== user.id) {
					throw new AuthorizationError("That isn't your call.")
				}

				const question = await tx.query.questions.findFirst({
					where: { id: call.questionId },
				})
				if (!question) throw new NotFoundError("Question not found")

				// Same clock-not-column reasoning as castCall:
				// lock-overdue-questions only flips "open" to "locked" every 15
				// minutes, so a row can read "open" well past its locksAt.
				if (question.status !== "open" || question.locksAt <= new Date()) {
					throw ValidationError.field(
						null,
						"This question has locked. Redos have to be in before then.",
					)
				}

				const existingRedo = await tx.query.callRedos.findFirst({
					where: { callId: call.id },
				})
				if (existingRedo) {
					throw ValidationError.field(
						null,
						"You've already used your redo on this call.",
					)
				}

				const data = parseInput(castCallSchema, {
					...args.input,
					questionId: question.id,
					shape: question.shape,
				})
				await validateCallInput(question, data, tx)
				await assertNotActiveLink(tx, call.id)
				await assertNoChainHedge(tx, {
					userId: user.id,
					questionId: question.id,
					optionIds: data.selections.map((s) => s.optionId),
				})

				const grant = await consumeRedoGrant(tx, user.id, call.id)
				if (!grant) {
					throw ValidationError.field(
						null,
						"You're out of redos. Invite a friend to earn another.",
					)
				}

				// Read the old picks before they're replaced.
				const oldSelections = await tx.query.callSelections.findMany({
					where: { callId: call.id },
				})

				const [redo] = await tx
					.insert(callRedos)
					.values({
						callId: call.id,
						grantId: grant.id,
						originalCreatedAt: call.createdAt,
						originalGuessValue: call.guessValue,
						originalConviction: call.conviction,
						originalCaseText: call.caseText,
					})
					.returning()

				if (oldSelections.length > 0) {
					await tx.insert(callRedoSelections).values(
						oldSelections.map((s) => ({
							redoId: redo.id,
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					)
				}

				await tx
					.delete(callSelections)
					.where(eq(callSelections.callId, call.id))
				if (data.selections.length > 0) {
					await tx
						.insert(callSelections)
						.values(await selectionRows(tx, call.id, data.selections))
				}

				const isNumericGuess = isNumericGuessShape(data.shape)
				const now = new Date()
				const [updated] = await tx
					.update(calls)
					.set({
						caseText: data.caseText || null,
						guessValue: isNumericGuess ? (data.guessValue ?? null) : null,
						conviction: isNumericGuess ? (data.conviction ?? null) : null,
						// The entire cost of a redo. Earliness is ranked off
						// this column (see earlinessFor, and numericGuessPoints'
						// own inline earliness), so re-stamping drops the caller
						// to the back of the field - they are calling it now,
						// not then. The original time is not lost; it's on the
						// redo row above, and the call page shows both.
						createdAt: now,
						// A redo is a call made now, at the price and series stage
						// it's made at (see selectionRows).
						...(await seriesStageFields(tx, question)),
					})
					.where(eq(calls.id, call.id))
					.returning()

				// No applySeasonStatDeltas: castCall's only cast-time delta is
				// callCount, and a redo doesn't change how many calls exist.

				// Spending is the only thing that frees wallet capacity, so
				// it's the only moment a referral that qualified while full can
				// be granted.
				await releaseWaitingReferral(tx, user.id)

				const balanceAfter = await redoBalanceFor(user.id, tx)

				await enqueueAnalyticsEvents(tx, [
					{
						event: "redo_spent",
						userId: user.id,
						properties: {
							callId: call.id,
							questionId: question.id,
							questionShape: question.shape,
							leagueId: question.leagueId,
							sportId: question.sportId,
							horizon: isSeasonLongShape(question.shape) ? "season" : "game",
							minutesToLock: minutesBetween(now, question.locksAt),
							minutesSinceOriginalCall: minutesBetween(call.createdAt, now),
							changedPick: pickChanged(oldSelections, data.selections),
							convictionDelta:
								avgConviction(data.selections, data.conviction) -
								avgConviction(oldSelections, call.conviction),
							balanceAfter,
						},
					},
				])

				return { call: updated, redoBalance: balanceAfter }
			})
		},
	}),
}))

function minutesBetween(from: Date, to: Date): number {
	return Math.round((to.getTime() - from.getTime()) / 60_000)
}

// Whether the redo actually moved off the original pick, as opposed to
// keeping it and only changing conviction. Order-insensitive, since an award
// call's picks are a set.
function pickChanged(
	before: { optionId: string }[],
	after: { optionId: string }[],
): boolean {
	if (before.length !== after.length) return true
	const beforeIds = new Set(before.map((s) => s.optionId))
	return !after.every((s) => beforeIds.has(s.optionId))
}

// One number for a call's conviction whether it's an option call (possibly
// several picks) or a numeric guess (one value on the call itself).
function avgConviction(
	selections: { conviction: number }[],
	fallback: number | null | undefined,
): number {
	if (selections.length === 0) return fallback ?? 0
	const total = selections.reduce((sum, s) => sum + s.conviction, 0)
	return Math.round(total / selections.length)
}

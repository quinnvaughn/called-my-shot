import { castCallSchema } from "@called-my-shot/schemas"
import { isNumericGuessShape } from "@called-my-shot/scoring"
import { db } from "../../../../db"
import { callSelections, calls } from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import { validateCallInput } from "../../../../lib/call-input"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { assertFadeable, recordFade } from "../../../../lib/fades"
import { qualifyReferralOnFirstCall } from "../../../../lib/referrals"
import { applySeasonStatDeltas } from "../../../../lib/user-season-stats"
import { builder } from "../../../builder"
import { parseInput } from "../../../helpers"
import { CastCallInput, CastCallPayload } from "../inputs"

builder.mutationFields((t) => ({
	castCall: t.field({
		type: CastCallPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "CastCallResult" },
		},
		args: { input: t.arg({ type: CastCallInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const question = await db.query.questions.findFirst({
				where: { id: args.input.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			// status alone can't be trusted here - lock-overdue-questions only
			// flips "open" to "locked" every 15 minutes, so a row can still read
			// "open" for a while after its locksAt and must be rejected on the
			// real clock, not the column.
			if (question.status !== "open" || question.locksAt <= new Date()) {
				throw ValidationError.field(
					null,
					"This question is no longer accepting calls.",
				)
			}

			const existing = await db.query.calls.findFirst({
				where: { questionId: question.id, userId: user.id },
			})
			if (existing) {
				throw ValidationError.field(
					null,
					"You've already called this question.",
				)
			}

			const data = parseInput(castCallSchema, {
				...args.input,
				shape: question.shape,
			})

			await validateCallInput(question, data)

			const call = await db.transaction(async (tx) => {
				const isNumericGuess = isNumericGuessShape(data.shape)

				const [call] = await tx
					.insert(calls)
					.values({
						questionId: question.id,
						userId: user.id,
						caseText: data.caseText || null,
						guessValue: isNumericGuess ? (data.guessValue ?? null) : null,
						conviction: isNumericGuess ? (data.conviction ?? null) : null,
					})
					.returning()

				if (data.selections.length > 0) {
					await tx.insert(callSelections).values(
						data.selections.map((s) => ({
							callId: call.id,
							optionId: s.optionId,
							conviction: s.conviction,
						})),
					)
				}

				await applySeasonStatDeltas(
					tx,
					question.leagueId,
					question.seasonId,
					new Map([
						[
							user.id,
							{
								points: 0,
								resolvedCallCount: 0,
								correctCount: 0,
								convictionSum: 0,
								convictionSumCorrect: 0,
								callCount: 1,
							},
						],
					]),
				)

				// An invite pays out on the invitee's first call, not on its
				// resolution: the redo is wanted for a game starting soon, and
				// a season-long question can take months to settle. A no-op
				// for everyone who wasn't referred - see the comment there.
				await qualifyReferralOnFirstCall(tx, user.id, {
					id: call.id,
					seasonId: question.seasonId,
				})

				if (args.input.fadesCallId) {
					const targetCall = await assertFadeable(tx, {
						targetCallId: String(args.input.fadesCallId),
						faderUserId: user.id,
						faderOptionId: data.selections[0]?.optionId,
						question,
					})
					await recordFade(tx, {
						faderCallId: call.id,
						targetCall,
						fader: user,
						question,
					})
				}

				return call
			})

			return { call }
		},
	}),
}))

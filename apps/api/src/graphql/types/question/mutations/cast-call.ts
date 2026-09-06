import { castCallSchema } from "@called-my-shot/schemas"
import { isNumericGuessShape } from "@called-my-shot/scoring"
import { db } from "../../../../db"
import { callSelections, calls } from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { applySeasonStatDeltas } from "../../../../lib/user-season-stats"
import { builder } from "../../../builder"
import { CastCallInput, CastCallPayload } from "../inputs"

builder.mutationFields((t) => ({
	castCall: t.field({
		type: CastCallPayload,
		errors: {
			types: [AuthenticationError, ValidationError, NotFoundError],
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

			// status alone can't be trusted here - nothing in the app ever flips
			// it from "open" to "locked" once locksAt passes (no cron/worker
			// exists), so a stale "open" row past its lock time must still be
			// rejected on the real clock, not the column.
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

			const parsed = castCallSchema.safeParse({
				...args.input,
				shape: question.shape,
			})
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			const data = parsed.data

			if (
				(data.shape === "player_season_award" ||
					data.shape === "team_season_award") &&
				data.selections.length !== question.picksRequired
			) {
				throw ValidationError.field(
					"selections",
					`Pick exactly ${question.picksRequired} - you picked ${data.selections.length}`,
				)
			}

			if (data.selections.length > 0) {
				const options = await db.query.questionOptions.findMany({
					where: { questionId: question.id },
					columns: { id: true },
				})
				const validIds = new Set(options.map((o) => o.id))
				if (!data.selections.every((s) => validIds.has(s.optionId))) {
					throw ValidationError.field(
						"selections",
						"One or more options don't belong to this question",
					)
				}
			}

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
								callCount: 1,
							},
						],
					]),
				)

				return call
			})

			return { call }
		},
	}),
}))

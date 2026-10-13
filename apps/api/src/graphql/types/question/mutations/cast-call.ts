import { db } from "../../../../db"
import { requireUser } from "../../../../lib/auth"
import {
	insertCallInTx,
	isAcceptingCalls,
	prepareCall,
} from "../../../../lib/cast-call"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import { assertFadeable, recordFade } from "../../../../lib/fades"
import { builder } from "../../../builder"
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

			if (!isAcceptingCalls(question)) {
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

			const data = await prepareCall(question, args.input)

			const call = await db.transaction(async (tx) => {
				const call = await insertCallInTx(tx, {
					userId: user.id,
					question,
					data,
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

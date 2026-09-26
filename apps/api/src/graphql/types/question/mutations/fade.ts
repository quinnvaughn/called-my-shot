import { db } from "../../../../db"
import type { Call, CallFade } from "../../../../db/schema"
import { calls } from "../../../../db/schema"
import { requireUser } from "../../../../lib/auth"
import {
	AuthenticationError,
	NotFoundError,
	ValidationError,
} from "../../../../lib/errors"
import {
	assertFadeable,
	gloatAsFader,
	gloatAtDoubters,
	loadCallSides,
	recordFade,
} from "../../../../lib/fades"
import { builder } from "../../../builder"
import { lockOrThrow } from "../../../helpers"
import { CallRef } from "../call"
import { CallFadeRef, GloatMessageEnum } from "../fade"

const AttachFadeInput = builder.inputType("AttachFadeInput", {
	fields: (t) => ({
		targetCallId: t.id({ required: true }),
	}),
})

const AttachFadePayload = builder
	.objectRef<{ call: Call }>("AttachFadePayload")
	.implement({
		fields: (t) => ({
			call: t.field({ type: CallRef, resolve: (payload) => payload.call }),
		}),
	})

// FADER: a doubter who cashed, gloating on their fade (fadeId). TARGET: the
// owner of a call that was right, gloating at every doubter who was wrong
// (callId).
const GloatInput = builder.inputType("GloatInput", {
	fields: (t) => ({
		fadeId: t.id({ required: false }),
		callId: t.id({ required: false }),
		message: t.field({ type: GloatMessageEnum, required: true }),
	}),
})

const GloatPayload = builder
	.objectRef<{ fades: CallFade[] }>("GloatPayload")
	.implement({
		fields: (t) => ({
			// Every fade the gloat landed on.
			fades: t.field({
				type: [CallFadeRef],
				resolve: (payload) => payload.fades,
			}),
		}),
	})

builder.mutationFields((t) => ({
	// Fading with a call the viewer already has. castCall's fadesCallId covers
	// a viewer with no call yet; this is for one already on the other side,
	// whose pick doesn't change - the call just gets aimed at someone.
	attachFade: t.field({
		type: AttachFadePayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "AttachFadeResult" },
		},
		args: { input: t.arg({ type: AttachFadeInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			return db.transaction(async (tx) => {
				const target = await tx.query.calls.findFirst({
					where: { id: String(args.input.targetCallId) },
				})
				if (!target) throw new NotFoundError("Call not found")

				const question = await tx.query.questions.findFirst({
					where: { id: target.questionId },
				})
				if (!question) throw new NotFoundError("Question not found")

				const mine = await tx.query.calls.findFirst({
					where: { questionId: question.id, userId: user.id },
				})
				if (!mine) {
					throw ValidationError.field(
						null,
						"You need a call on this question to aim it.",
					)
				}
				// Locked so two attaches from the same call can't race past the
				// one-fade-per-call check; the unique constraint would reject
				// the second insert anyway, but as a raw error.
				await lockOrThrow(tx, calls, mine.id, "Call not found")

				const existing = await tx.query.callFades.findFirst({
					where: { faderCallId: mine.id },
				})
				if (existing) {
					throw ValidationError.field(
						null,
						"Your call is already fading someone.",
					)
				}

				const mySide = (await loadCallSides(tx, [mine.id])).get(mine.id)
				const targetCall = await assertFadeable(tx, {
					targetCallId: target.id,
					faderUserId: user.id,
					faderOptionId: mySide?.optionId,
					question,
				})
				await recordFade(tx, {
					faderCallId: mine.id,
					targetCall,
					fader: user,
					question,
				})
				return { call: mine }
			})
		},
	}),
	// The winning side of a settled fade, once per fade.
	gloat: t.field({
		type: GloatPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "GloatResult" },
		},
		args: { input: t.arg({ type: GloatInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { fadeId, callId, message } = args.input

			return db.transaction(async (tx) => {
				if (fadeId) {
					const fade = await tx.query.callFades.findFirst({
						where: { id: String(fadeId) },
					})
					if (!fade) throw new NotFoundError("Fade not found")
					const updated = await gloatAsFader(tx, {
						fade,
						viewer: user,
						message,
					})
					return { fades: [updated] }
				}
				if (callId) {
					const fades = await gloatAtDoubters(tx, {
						targetCallId: String(callId),
						viewer: user,
						message,
					})
					return { fades }
				}
				throw ValidationError.field(null, "Say who the gloat is for.")
			})
		},
	}),
}))

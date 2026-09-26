import { GLOAT_MESSAGES, type GloatMessage } from "@called-my-shot/schemas"
import { isTwoSidedShape } from "@called-my-shot/scoring"
import { db } from "../../../db"
import type { Call, QuestionOption } from "../../../db/schema"
import { fadeWinner } from "../../../lib/fades"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { CallRef } from "./call"
import {
	callSideLoader,
	fadeByFaderLoader,
	fadesByTargetLoader,
	loadQuestionFacts,
	userQuestionCallLoader,
} from "./loaders"
import { QuestionOptionRef } from "./question-object"

export const GloatMessageEnum = builder.enumType("GloatMessage", {
	values: Object.fromEntries(
		GLOAT_MESSAGES.map((value) => [value.toUpperCase(), { value }]),
	) as Record<string, { value: GloatMessage }>,
})

// Which side of a fade a call is on - the call that was aimed, or the call it
// was aimed at.
const FadeSideEnum = builder.enumType("FadeSide", {
	values: ["FADER", "TARGET"] as const,
})

async function winnerOf(
	ctx: Context,
	fade: { faderCallId: string; targetCallId: string },
) {
	const [fader, target] = await Promise.all([
		callSideLoader(ctx).load(fade.faderCallId),
		callSideLoader(ctx).load(fade.targetCallId),
	])
	return fadeWinner(fader ?? undefined, target ?? undefined)
}

// One call aimed at another. See callFades for why who won isn't stored.
export const CallFadeRef = builder.drizzleObject("callFades", {
	name: "CallFade",
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({ type: "DateTime", resolve: (f) => f.createdAt }),
		// The fader's call.
		call: t.relation("faderCall"),
		// The call being faded.
		target: t.relation("targetCall"),
		// Set once the target redid onto the fader's side.
		targetFlippedAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (f) => f.targetFlippedAt,
		}),
		// Null until the question settles, and for good after a void or a flip.
		winner: t.field({
			type: FadeSideEnum,
			nullable: true,
			resolve: async (fade, _args, ctx) => {
				const winner = await winnerOf(ctx, fade)
				if (winner === null) return null
				return winner === "fader" ? "FADER" : "TARGET"
			},
		}),
		// The line the winning side sent, if it has. Only the current winner's
		// gloat is returned, so one from a result that was later overturned
		// stops showing without anything having to clear it.
		gloat: t.field({
			type: GloatMessageEnum,
			nullable: true,
			resolve: async (fade, _args, ctx) => {
				const winner = await winnerOf(ctx, fade)
				if (winner === "fader") return fade.faderGloatMessage
				if (winner === "target") return fade.targetGloatMessage
				return null
			},
		}),
	}),
})

// How the viewer could fade a call. NEW casts a fresh call on the other side;
// ATTACH aims a call they already have on the other side.
const FadeOfferModeEnum = builder.enumType("FadeOfferMode", {
	values: ["NEW", "ATTACH"] as const,
})

type FadeOffer = { mode: "NEW" | "ATTACH"; option: QuestionOption }

const FadeOfferRef = builder.objectRef<FadeOffer>("FadeOffer").implement({
	fields: (t) => ({
		mode: t.field({ type: FadeOfferModeEnum, resolve: (o) => o.mode }),
		// The other side from the call - the only pick a fade can make.
		option: t.field({ type: QuestionOptionRef, resolve: (o) => o.option }),
	}),
})

async function fadeOfferFor(
	ctx: Context,
	call: Call,
): Promise<FadeOffer | null> {
	if (ctx.user?.id === call.userId) return null
	const question = await loadQuestionFacts(ctx, call.questionId)
	if (!question || !isTwoSidedShape(question.shape)) return null
	if (question.status !== "open" || question.locksAt <= new Date()) return null

	const targetSide = await callSideLoader(ctx).load(call.id)
	if (!targetSide) return null
	const options = await db.query.questionOptions.findMany({
		where: { questionId: question.id },
	})
	const option = options.find((o) => o.id !== targetSide.optionId)
	if (!option) return null

	// Signed out reads as NEW: the button asks them to sign in first, and the
	// mutation re-checks everything once they have.
	if (!ctx.user) return { mode: "NEW", option }

	const mine = await userQuestionCallLoader(ctx).load(
		`${ctx.user.id}:${question.id}`,
	)
	if (!mine) return { mode: "NEW", option }
	const mySide = await callSideLoader(ctx).load(mine.id)
	if (mySide?.optionId !== option.id) return null
	if (await fadeByFaderLoader(ctx).load(mine.id)) return null
	return { mode: "ATTACH", option }
}

// Who the viewer could gloat at from this call's page. DOUBTERS: the viewer
// owns this call, it was right, and some doubters who were wrong haven't been
// gloated at yet - one gloat reaches all of them. TARGET: the viewer faded a
// call and cashed, and hasn't gloated at its owner yet.
const GloatAudienceEnum = builder.enumType("GloatAudience", {
	values: ["DOUBTERS", "TARGET"] as const,
})

type GloatOffer =
	| { audience: "DOUBTERS"; count: number }
	| { audience: "TARGET"; fadeId: string; targetUserId: string }

const GloatOfferRef = builder.objectRef<GloatOffer>("GloatOffer").implement({
	fields: (t) => ({
		audience: t.field({ type: GloatAudienceEnum, resolve: (o) => o.audience }),
		// DOUBTERS: how many the gloat would reach.
		count: t.int({
			resolve: (o) => (o.audience === "DOUBTERS" ? o.count : 1),
		}),
		// TARGET: the fade being gloated on.
		fadeId: t.id({
			nullable: true,
			resolve: (o) => (o.audience === "TARGET" ? o.fadeId : null),
		}),
		// TARGET: whose call it was.
		targetUsername: t.string({
			nullable: true,
			resolve: async (o) => {
				if (o.audience !== "TARGET") return null
				const user = await db.query.users.findFirst({
					where: { id: o.targetUserId },
					columns: { username: true },
				})
				return user?.username ?? null
			},
		}),
	}),
})

async function gloatOfferFor(
	ctx: Context,
	call: Call,
): Promise<GloatOffer | null> {
	const viewerId = ctx.user?.id
	if (!viewerId) return null

	// A fade the viewer's call won and hasn't gloated on, aimed at a call
	// whose owner is returned alongside it.
	const openFaderGloat = async (faderCallId: string) => {
		const fade = await fadeByFaderLoader(ctx).load(faderCallId)
		if (!fade || fade.faderGloatedAt !== null) return null
		if ((await winnerOf(ctx, fade)) !== "fader") return null
		const target = await callSideLoader(ctx).load(fade.targetCallId)
		if (!target) return null
		return {
			audience: "TARGET" as const,
			fadeId: fade.id,
			targetUserId: target.userId,
		}
	}

	if (call.userId === viewerId) {
		const doubters = await fadesByTargetLoader(ctx).load(call.id)
		const winners = await Promise.all(
			doubters.map(async (fade) =>
				fade.targetGloatedAt === null ? winnerOf(ctx, fade) : null,
			),
		)
		const count = winners.filter((w) => w === "target").length
		if (count > 0) return { audience: "DOUBTERS", count }
		return openFaderGloat(call.id)
	}

	// Someone else's call: the viewer can gloat here if their own call on
	// this question faded this one and cashed.
	const mine = await userQuestionCallLoader(ctx).load(
		`${viewerId}:${call.questionId}`,
	)
	if (!mine) return null
	const offer = await openFaderGloat(mine.id)
	return offer && offer.targetUserId === call.userId ? offer : null
}

builder.objectFields(CallRef, (t) => ({
	// Who the viewer could gloat at from this page right now, or null.
	viewerGloat: t.field({
		type: GloatOfferRef,
		nullable: true,
		resolve: (call, _args, ctx) => gloatOfferFor(ctx, call),
	}),
	// How the viewer could fade this call right now, or null when they can't:
	// it's their own call, the question isn't two-sided or is no longer open,
	// they're on the same side, or their call already fades someone.
	fadeOffer: t.field({
		type: FadeOfferRef,
		nullable: true,
		resolve: (call, _args, ctx) => fadeOfferFor(ctx, call),
	}),
	// The fades aimed at this call, oldest first.
	doubters: t.field({
		type: [CallFadeRef],
		resolve: (call, _args, ctx) => fadesByTargetLoader(ctx).load(call.id),
	}),
	// The fade this call is, if it was aimed at someone.
	fading: t.field({
		type: CallFadeRef,
		nullable: true,
		resolve: (call, _args, ctx) => fadeByFaderLoader(ctx).load(call.id),
	}),
}))

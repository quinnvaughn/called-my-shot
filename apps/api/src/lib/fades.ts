import { GLOAT_OPTIONS, type GloatMessage } from "@called-my-shot/schemas"
import { isTwoSidedShape } from "@called-my-shot/scoring"
import { and, eq, inArray, isNull } from "drizzle-orm"
import {
	type CallFade,
	callFades,
	callSelections,
	calls,
	type Question,
	questionOptions,
	questions,
} from "../db/schema"
import type { DbOrTx, Tx } from "../db/types"
import { ValidationError } from "./errors"
import { createNotification, createNotifications } from "./notifications"

// Where a call stands on a two-sided question: the one option it picked, and
// whether that option turned out right (null until the question resolves).
export type CallSide = {
	callId: string
	userId: string
	questionId: string
	optionId: string
	isCorrect: boolean | null
	questionStatus: Question["status"]
}

// Every call a fade touches is on a two-sided question, so each has exactly
// one selection and this is one row per call. A call with no selection (a
// numeric guess) has no side and is simply absent from the map.
export async function loadCallSides(
	q: DbOrTx,
	callIds: string[],
): Promise<Map<string, CallSide>> {
	if (callIds.length === 0) return new Map()
	const rows = await q
		.select({
			callId: calls.id,
			userId: calls.userId,
			questionId: calls.questionId,
			optionId: callSelections.optionId,
			isCorrect: questionOptions.isCorrect,
			questionStatus: questions.status,
		})
		.from(calls)
		.innerJoin(callSelections, eq(callSelections.callId, calls.id))
		.innerJoin(questionOptions, eq(questionOptions.id, callSelections.optionId))
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(inArray(calls.id, callIds))
	return new Map(rows.map((row) => [row.callId, row]))
}

export type FadeWinner = "fader" | "target"

// Which side of a fade was right, or null while there's no answer: before
// resolution, after a void, and once the target flipped onto the fader's
// side (the two calls then stand or fall together). A disputed question's
// result stands until the dispute is decided, the same as everywhere else
// a result is read.
//
// Read live rather than stored, so an overturned dispute hands the win to the
// other side without anything having to rewrite the fade.
export function fadeWinner(
	fader: CallSide | undefined,
	target: CallSide | undefined,
): FadeWinner | null {
	if (!fader || !target) return null
	if (
		fader.questionStatus !== "resolved" &&
		fader.questionStatus !== "disputed"
	) {
		return null
	}
	if (fader.isCorrect === true && target.isCorrect === false) return "fader"
	if (target.isCorrect === true && fader.isCorrect === false) return "target"
	return null
}

// The rules a fade has to pass however it's made, whether cast fresh with the
// call or attached to a call the fader already had. Checked against the
// target's current pick: a target that already redid is faded on where they
// stand now.
export async function assertFadeable(
	tx: Tx,
	{
		targetCallId,
		faderUserId,
		faderOptionId,
		question,
	}: {
		targetCallId: string
		faderUserId: string
		faderOptionId: string | undefined
		question: Question
	},
) {
	const target = (await loadCallSides(tx, [targetCallId])).get(targetCallId)
	if (!target || target.questionId !== question.id) {
		throw ValidationError.field(null, "That call isn't on this question.")
	}
	if (target.userId === faderUserId) {
		throw ValidationError.field(null, "You can't fade your own call.")
	}
	if (!isTwoSidedShape(question.shape)) {
		throw ValidationError.field(
			null,
			"Only calls on two-sided questions can be faded.",
		)
	}
	// Same real-clock check as castCall: the status column trails locksAt by
	// up to one lock-overdue-questions run.
	if (question.status !== "open" || question.locksAt <= new Date()) {
		throw ValidationError.field(
			null,
			"This question is no longer accepting calls.",
		)
	}
	if (!faderOptionId || faderOptionId === target.optionId) {
		throw ValidationError.field(
			null,
			"A fade has to take the other side of the call.",
		)
	}
	return target
}

// Links the fader's call to the target and tells the target. The caller has
// already run assertFadeable in the same transaction.
export async function recordFade(
	tx: Tx,
	{
		faderCallId,
		targetCall,
		fader,
		question,
	}: {
		faderCallId: string
		targetCall: CallSide
		fader: { id: string; username: string }
		question: Question
	},
) {
	const [fade] = await tx
		.insert(callFades)
		.values({ faderCallId, targetCallId: targetCall.callId })
		.returning()
	await createNotification(tx, {
		type: "call_faded",
		userId: targetCall.userId,
		actorId: fader.id,
		actorUsername: fader.username,
		questionId: question.id,
		questionTitle: question.title,
		callId: targetCall.callId,
	})
	return fade
}

// A redo can move a call onto the same side as a call it's linked to by a
// fade. Run after the redo's new selection is written.
//
// As the fader: a fade on the same side as its target isn't a fade, so the
// link goes. As the target: the fade stays and is marked flipped, because a
// target talked onto their doubter's side is the point of keeping the record.
export async function reconcileFadesAfterRedo(tx: Tx, callId: string) {
	const outgoing = await tx.query.callFades.findFirst({
		where: { faderCallId: callId },
	})
	const incoming = await tx.query.callFades.findMany({
		where: { targetCallId: callId },
	})
	if (!outgoing && incoming.length === 0) return

	const sides = await loadCallSides(tx, [
		callId,
		...(outgoing ? [outgoing.targetCallId] : []),
		...incoming.map((fade) => fade.faderCallId),
	])
	const mine = sides.get(callId)
	if (!mine) return

	if (
		outgoing &&
		sides.get(outgoing.targetCallId)?.optionId === mine.optionId
	) {
		await tx.delete(callFades).where(eq(callFades.id, outgoing.id))
	}

	const flipped = incoming
		.filter((fade) => sides.get(fade.faderCallId)?.optionId === mine.optionId)
		.map((fade) => fade.id)
	if (flipped.length > 0) {
		await tx
			.update(callFades)
			.set({ targetFlippedAt: new Date() })
			.where(
				and(inArray(callFades.id, flipped), isNull(callFades.targetFlippedAt)),
			)
	}
}

// A doubter who cashed, gloating at the call they faded. One gloat per fade,
// and the target is told once.
export async function gloatAsFader(
	tx: Tx,
	{
		fade,
		viewer,
		message,
	}: {
		fade: CallFade
		viewer: { id: string; username: string }
		message: GloatMessage
	},
) {
	if (!GLOAT_OPTIONS.fader.includes(message)) {
		throw ValidationError.field("message", "That isn't one of the options.")
	}
	const sides = await loadCallSides(tx, [fade.faderCallId, fade.targetCallId])
	const fader = sides.get(fade.faderCallId)
	const target = sides.get(fade.targetCallId)
	if (
		!fader ||
		!target ||
		fader.userId !== viewer.id ||
		fadeWinner(fader, target) !== "fader"
	) {
		throw ValidationError.field(null, "Only the side that won can gloat.")
	}

	// Conditional on the column still being empty, so two taps racing each
	// other can't both land and send two notifications.
	const [updated] = await tx
		.update(callFades)
		.set({ faderGloatedAt: new Date(), faderGloatMessage: message })
		.where(and(eq(callFades.id, fade.id), isNull(callFades.faderGloatedAt)))
		.returning()
	if (!updated) {
		throw ValidationError.field(null, "You already gloated on this one.")
	}

	await notifyGloat(tx, {
		viewer,
		questionId: fader.questionId,
		losers: [target],
	})
	return updated
}

// The target of a fade that was right, gloating at every doubter who was
// wrong in one go. Doubters it already gloated at are skipped rather than
// told twice.
export async function gloatAtDoubters(
	tx: Tx,
	{
		targetCallId,
		viewer,
		message,
	}: {
		targetCallId: string
		viewer: { id: string; username: string }
		message: GloatMessage
	},
) {
	if (!GLOAT_OPTIONS.target.includes(message)) {
		throw ValidationError.field("message", "That isn't one of the options.")
	}
	const fades = await tx.query.callFades.findMany({
		where: { targetCallId },
	})
	const sides = await loadCallSides(tx, [
		targetCallId,
		...fades.map((fade) => fade.faderCallId),
	])
	const target = sides.get(targetCallId)
	if (!target || target.userId !== viewer.id) {
		throw ValidationError.field(null, "Only the side that won can gloat.")
	}

	const wrong = fades.filter(
		(fade) =>
			fade.targetGloatedAt === null &&
			fadeWinner(sides.get(fade.faderCallId), target) === "target",
	)
	if (wrong.length === 0) {
		throw ValidationError.field(null, "There's no one left to gloat at.")
	}

	const updated = await tx
		.update(callFades)
		.set({ targetGloatedAt: new Date(), targetGloatMessage: message })
		.where(
			and(
				inArray(
					callFades.id,
					wrong.map((fade) => fade.id),
				),
				isNull(callFades.targetGloatedAt),
			),
		)
		.returning()

	await notifyGloat(tx, {
		viewer,
		questionId: target.questionId,
		losers: updated.flatMap((fade) => {
			const side = sides.get(fade.faderCallId)
			return side ? [side] : []
		}),
	})
	return updated
}

async function notifyGloat(
	tx: Tx,
	{
		viewer,
		questionId,
		losers,
	}: {
		viewer: { id: string; username: string }
		questionId: string
		losers: CallSide[]
	},
) {
	const question = await tx.query.questions.findFirst({
		where: { id: questionId },
		columns: { id: true, title: true },
	})
	if (!question) return
	await createNotifications(
		tx,
		losers.map((loser) => ({
			type: "fade_gloated" as const,
			userId: loser.userId,
			actorId: viewer.id,
			actorUsername: viewer.username,
			questionId: question.id,
			questionTitle: question.title,
			callId: loser.callId,
		})),
	)
}

import { type CastCallInput, castCallSchema } from "@called-my-shot/schemas"
import { isNumericGuessShape } from "@called-my-shot/scoring"
import { inArray } from "drizzle-orm"
import type { Question } from "../db/schema"
import { callSelections, calls, questionOptions } from "../db/schema"
import type { DbOrTx, Tx } from "../db/types"
import { validateCallInput } from "./call-input"
import { assertNoChainHedge } from "./chains/hedge"
import { ValidationError } from "./errors"
import { seriesCallStage } from "./postseason/series-questions"
import { qualifyReferralOnFirstCall } from "./referrals"
import { applySeasonStatDeltas } from "./user-season-stats"

// Whether a question takes new calls right now. status alone can't be trusted
// here - lock-overdue-questions only flips "open" to "locked" every 15
// minutes, so a row can still read "open" for a while after its locksAt and
// must be rejected on the real clock, not the column.
export function isAcceptingCalls(
	question: Pick<Question, "status" | "locksAt">,
	now = new Date(),
): boolean {
	return question.status === "open" && question.locksAt > now
}

// Checks a call against its question and returns it parsed. Doesn't look at
// whether the caller already has a call on it; that check differs by caller.
export async function prepareCall(
	question: Question,
	input: unknown,
	executor?: DbOrTx,
): Promise<CastCallInput> {
	if (!isAcceptingCalls(question)) {
		throw ValidationError.field(
			null,
			"This question is no longer accepting calls.",
		)
	}
	const parsed = castCallSchema.safeParse({
		...(input as object),
		shape: question.shape,
	})
	if (!parsed.success) throw ValidationError.fromZodIssues(parsed.error.issues)
	await validateCallInput(question, parsed.data, executor)
	return parsed.data
}

// A call's selection rows, each carrying its side's price as it stands right
// now - see callSelections.lossRate.
export async function selectionRows(
	tx: Tx,
	callId: string,
	selections: { optionId: string; conviction: number }[],
) {
	if (selections.length === 0) return []
	const prices = await tx
		.select({
			id: questionOptions.id,
			lossRate: questionOptions.lossRate,
			winMult: questionOptions.winMult,
			modelHitRate: questionOptions.modelHitRate,
		})
		.from(questionOptions)
		.where(
			inArray(
				questionOptions.id,
				selections.map((s) => s.optionId),
			),
		)
	const priceById = new Map(prices.map((p) => [p.id, p]))
	return selections.map((s) => ({
		callId,
		optionId: s.optionId,
		conviction: s.conviction,
		lossRate: priceById.get(s.optionId)?.lossRate ?? null,
		winMult: priceById.get(s.optionId)?.winMult ?? null,
		modelHitRate: priceById.get(s.optionId)?.modelHitRate ?? null,
	}))
}

// How far into its series a call on a series question is made, and what
// that leaves it worth - see calls.seriesWeight. Empty on any other question.
export async function seriesStageFields(
	tx: Tx,
	question: Pick<Question, "seriesId">,
): Promise<{ seriesGamesPlayed?: number; seriesWeight?: number }> {
	if (!question.seriesId) return {}
	return (await seriesCallStage(tx, question.seriesId)) ?? {}
}

// Writes a new call and everything a first call on a question touches: its
// selections, the caller's call count for the season, and a pending referral.
export async function insertCallInTx(
	tx: Tx,
	input: { userId: string; question: Question; data: CastCallInput },
) {
	const { userId, question, data } = input
	const isNumericGuess = isNumericGuessShape(data.shape)
	await assertNoChainHedge(tx, {
		userId,
		questionId: question.id,
		optionIds: data.selections.map((s) => s.optionId),
	})

	const [call] = await tx
		.insert(calls)
		.values({
			questionId: question.id,
			userId,
			caseText: data.caseText || null,
			guessValue: isNumericGuess ? (data.guessValue ?? null) : null,
			conviction: isNumericGuess ? (data.conviction ?? null) : null,
			...(await seriesStageFields(tx, question)),
		})
		.returning()

	if (data.selections.length > 0) {
		await tx
			.insert(callSelections)
			.values(await selectionRows(tx, call.id, data.selections))
	}

	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		new Map([
			[
				userId,
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

	// An invite pays out on the invitee's first call, not on its resolution:
	// the redo is wanted for a game starting soon, and a season-long question
	// can take months to settle. A no-op for everyone who wasn't referred -
	// see the comment there.
	await qualifyReferralOnFirstCall(tx, userId, {
		id: call.id,
		seasonId: question.seasonId,
	})

	return call
}

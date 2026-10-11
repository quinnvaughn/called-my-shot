import { isSeasonLongShape, type QuestionShape } from "@called-my-shot/scoring"
import type { Call } from "../../../db/schema"
import {
	loadSeasonPlay,
	type SeasonPlay,
	seasonPlayWeightOf,
} from "../../../lib/season-play"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { ctxLoader } from "../../loader"
import { loadQuestionFacts } from "./loaders"

// A caller's play in a league season, and what it makes a season-long call
// worth - see seasonPlayWeight. Settled once the question first resolves;
// until then it's the caller's pace so far.
export type SeasonPlayView = SeasonPlay & { settled: boolean }

export const SeasonPlayRef = builder
	.objectRef<SeasonPlayView>("SeasonPlay")
	.implement({
		fields: (t) => ({
			weeksPlayed: t.exposeInt("weeksPlayed"),
			weeksCounted: t.exposeInt("weeksCounted"),
			// The share of its full points a season-long call is worth.
			weight: t.float({ resolve: (play) => seasonPlayWeightOf(play) }),
			// True once read at the question's resolution and saved on the
			// call; false while it's the pace so far.
			settled: t.exposeBoolean("settled"),
		}),
	})

// Each "<seasonId>:<userId>" key's play as of this request, one query per
// season however many questions and calls ask.
const seasonPlayLoader = ctxLoader(async (keys: string[]) => {
	const asOf = new Date()
	const usersBySeason = new Map<string, Set<string>>()
	for (const key of keys) {
		const [seasonId = "", userId = ""] = key.split(":")
		usersBySeason.set(
			seasonId,
			(usersBySeason.get(seasonId) ?? new Set()).add(userId),
		)
	}
	const playByKey = new Map<string, SeasonPlay>()
	await Promise.all(
		[...usersBySeason].map(async ([seasonId, userIds]) => {
			const play = await loadSeasonPlay(seasonId, [...userIds], asOf)
			for (const [userId, row] of play) {
				playByKey.set(`${seasonId}:${userId}`, row)
			}
		}),
	)
	return keys.map(
		(key) => playByKey.get(key) ?? { weeksPlayed: 0, weeksCounted: 0 },
	)
})

// A season-long question's play for `userId` right now. Null on any other
// question, where play doesn't touch the points.
export async function paceFor(
	ctx: Context,
	question: { shape: QuestionShape; seasonId: string },
	userId: string,
): Promise<SeasonPlayView | null> {
	if (!isSeasonLongShape(question.shape)) return null
	const play = await seasonPlayLoader(ctx).load(
		`${question.seasonId}:${userId}`,
	)
	return { ...play, settled: false }
}

// A call's play: what was saved on it at resolution, else its caller's pace
// so far. Null on a call that isn't season-long.
export async function callSeasonPlay(
	ctx: Context,
	call: Call,
): Promise<SeasonPlayView | null> {
	const question = await loadQuestionFacts(ctx, call.questionId)
	if (!question || !isSeasonLongShape(question.shape)) return null
	if (
		call.seasonPlayWeeksPlayed !== null &&
		call.seasonPlayWeeksCounted !== null
	) {
		return {
			weeksPlayed: call.seasonPlayWeeksPlayed,
			weeksCounted: call.seasonPlayWeeksCounted,
			settled: true,
		}
	}
	return paceFor(ctx, question, call.userId)
}

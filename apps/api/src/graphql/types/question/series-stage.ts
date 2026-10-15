import { seriesStageWeight } from "@called-my-shot/scoring"
import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { type Call, games, type Question } from "../../../db/schema"
import { builder } from "../../builder"
import type { Context } from "../../context"
import { ctxLoader, indexByKey } from "../../loader"
import { loadQuestionFacts } from "./loaders"

// How far into its series a series question is, or was when a call on it was
// made, and the share of its full points that leaves a call worth - see
// seriesStageWeight.
export type SeriesStage = {
	gamesPlayed: number
	bestOf: number
	weight: number
}

export const SeriesStageRef = builder
	.objectRef<SeriesStage>("SeriesStage")
	.implement({
		fields: (t) => ({
			// The series' games already final.
			gamesPlayed: t.exposeInt("gamesPlayed"),
			bestOf: t.exposeInt("bestOf"),
			// The share of its full points a call is worth, hit and miss alike.
			weight: t.exposeFloat("weight"),
		}),
	})

// Each series' length and its games final so far, one query each for a
// page's worth of series questions.
const seriesProgressLoader = ctxLoader(async (seriesIds: string[]) => {
	const [rows, finals] = await Promise.all([
		db.query.postseasonSeries.findMany({
			where: { id: { in: seriesIds } },
			columns: { id: true, bestOf: true },
		}),
		db
			.select({ seriesId: games.seriesId, n: count() })
			.from(games)
			.where(and(inArray(games.seriesId, seriesIds), eq(games.status, "final")))
			.groupBy(games.seriesId),
	])
	const finalsById = new Map(finals.map((row) => [row.seriesId, row.n]))
	return indexByKey(
		seriesIds,
		rows.map((row) => ({
			id: row.id,
			bestOf: row.bestOf,
			gamesPlayed: finalsById.get(row.id) ?? 0,
		})),
		(row) => row.id,
		null,
	)
})

// What a call made on a series question right now would be worth. Null on
// any other question.
export async function questionSeriesStage(
	ctx: Context,
	question: Pick<Question, "seriesId">,
): Promise<SeriesStage | null> {
	if (!question.seriesId) return null
	const progress = await seriesProgressLoader(ctx).load(question.seriesId)
	if (!progress?.bestOf) return null
	return {
		gamesPlayed: progress.gamesPlayed,
		bestOf: progress.bestOf,
		weight: seriesStageWeight(progress.gamesPlayed, progress.bestOf),
	}
}

// The stage a call on a series question was made at, as saved on it. Null on
// any other call.
export async function callSeriesStage(
	ctx: Context,
	call: Call,
): Promise<SeriesStage | null> {
	if (call.seriesGamesPlayed === null || call.seriesWeight === null) {
		return null
	}
	const question = await loadQuestionFacts(ctx, call.questionId)
	if (!question?.seriesId) return null
	const progress = await seriesProgressLoader(ctx).load(question.seriesId)
	if (!progress?.bestOf) return null
	return {
		gamesPlayed: call.seriesGamesPlayed,
		bestOf: progress.bestOf,
		weight: call.seriesWeight,
	}
}

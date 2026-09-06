import DataLoader from "dataloader"
import { count, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { callSelections, calls } from "../../../db/schema"
import type { Context } from "../../context"

// fieldPct below used to run two unbatched findMany calls per option (its own
// selection count, its question's total call count) - a feed page of ~10
// questions with a few options apiece turns that into dozens of sequential
// round trips for one field, the same shape of bug as questionLeagueIdLoaders
// further down. Grouped COUNT queries, one per request per side, instead.
const optionSelectionCountLoaders = new WeakMap<
	Context,
	DataLoader<string, number>
>()
export function getOptionSelectionCountLoader(ctx: Context) {
	let loader = optionSelectionCountLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, number>(async (optionIds) => {
			const ids = [...optionIds]
			const rows = await db
				.select({ optionId: callSelections.optionId, n: count() })
				.from(callSelections)
				.where(inArray(callSelections.optionId, ids))
				.groupBy(callSelections.optionId)
			const countByOption = new Map(rows.map((r) => [r.optionId, r.n]))
			return ids.map((id) => countByOption.get(id) ?? 0)
		})
		optionSelectionCountLoaders.set(ctx, loader)
	}
	return loader
}

const questionCallCountLoaders = new WeakMap<
	Context,
	DataLoader<string, number>
>()
export function getQuestionCallCountLoader(ctx: Context) {
	let loader = questionCallCountLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, number>(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db
				.select({ questionId: calls.questionId, n: count() })
				.from(calls)
				.where(inArray(calls.questionId, ids))
				.groupBy(calls.questionId)
			const countByQuestion = new Map(rows.map((r) => [r.questionId, r.n]))
			return ids.map((id) => countByQuestion.get(id) ?? 0)
		})
		questionCallCountLoaders.set(ctx, loader)
	}
	return loader
}

// averageGuess/numericHitRatePct/guessDistribution below all used to run
// their own unbatched db.query.calls.findMany per question (every one of
// them, unconditionally - even for shapes where the fields end up null),
// each a duplicate fetch of the same rows. One batched, grouped query per
// request instead, shared by all three.
const questionGuessCallsLoaders = new WeakMap<
	Context,
	DataLoader<
		string,
		{ guessValue: number | null; hitTolerance: boolean | null }[]
	>
>()
export function getQuestionGuessCallsLoader(ctx: Context) {
	let loader = questionGuessCallsLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db.query.calls.findMany({
				where: { questionId: { in: ids } },
				columns: { questionId: true, guessValue: true, hitTolerance: true },
			})
			const byQuestion = new Map<string, typeof rows>()
			for (const row of rows) {
				const list = byQuestion.get(row.questionId)
				if (list) {
					list.push(row)
				} else {
					byQuestion.set(row.questionId, [row])
				}
			}
			return ids.map((id) => byQuestion.get(id) ?? [])
		})
		questionGuessCallsLoaders.set(ctx, loader)
	}
	return loader
}

// callerLeagueAccuracy below used to run its own db.query.questions.findFirst
// per call just to read that call's question's leagueId - unbatched, same
// shape as the canViewerSeePick N+1 (lib/call-visibility.ts), just simpler:
// this fact has no viewer dependency at all, so it's a plain per-request
// batch keyed by questionId rather than needing a viewer-scoped cache.
const questionLeagueIdLoaders = new WeakMap<
	Context,
	DataLoader<string, string | undefined>
>()

export function getQuestionLeagueIdLoader(ctx: Context) {
	let loader = questionLeagueIdLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, string | undefined>(async (questionIds) => {
			const ids = [...questionIds]
			const rows = await db.query.questions.findMany({
				where: { id: { in: ids } },
				columns: { id: true, leagueId: true },
			})
			const leagueIdById = new Map(rows.map((q) => [q.id, q.leagueId]))
			return ids.map((id) => leagueIdById.get(id))
		})
		questionLeagueIdLoaders.set(ctx, loader)
	}
	return loader
}

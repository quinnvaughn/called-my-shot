import { STREAK_TAG_MIN, type StreakFamily } from "@called-my-shot/scoring"
import DataLoader from "dataloader"
import { count, inArray } from "drizzle-orm"
import { db } from "../../../db"
import { callSelections, calls, type UserStreak } from "../../../db/schema"
import type { Context } from "../../context"

export type CallStreakMark = { length: number; family: StreakFamily }

// Question.viewerStreak - the viewer's own track for each question's league
// and family, keyed "<leagueId>:<family>". One read of their streaks per
// request however many questions on the page ask.
const viewerStreakLoaders = new WeakMap<
	Context,
	DataLoader<string, UserStreak | null>
>()
export function getViewerStreakLoader(ctx: Context, userId: string) {
	let loader = viewerStreakLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, UserStreak | null>(async (keys) => {
			const leagueIds = [...new Set(keys.map((key) => key.split(":")[0] ?? ""))]
			const rows = await db.query.userStreaks.findMany({
				where: { userId, leagueId: { in: leagueIds } },
			})
			const byKey = new Map(
				rows.map((row) => [`${row.leagueId}:${row.family}`, row]),
			)
			return keys.map((key) => byKey.get(key) ?? null)
		})
		viewerStreakLoaders.set(ctx, loader)
	}
	return loader
}

// Call.streak below, on every call card in a feed - one batched read of the
// streak cache per request rather than one per card. Null unless the call is
// at least STREAK_TAG_MIN into a run, and unless its result still stands: the
// cache is rebuilt shortly after a result changes, not in the same
// transaction, so a call voided a moment ago can briefly still have a row.
const callStreakLoaders = new WeakMap<
	Context,
	DataLoader<string, CallStreakMark | null>
>()
export function getCallStreakLoader(ctx: Context) {
	let loader = callStreakLoaders.get(ctx)
	if (!loader) {
		loader = new DataLoader<string, CallStreakMark | null>(async (callIds) => {
			const ids = [...callIds]
			const rows = await db.query.callStreakPositions.findMany({
				where: { callId: { in: ids }, length: { gte: STREAK_TAG_MIN } },
				columns: { callId: true, length: true, family: true },
				with: {
					call: {
						columns: { unscoredReason: true },
						with: { question: { columns: { status: true } } },
					},
				},
			})
			const markByCallId = new Map(
				rows.flatMap((row) => {
					const status = row.call?.question?.status
					const standing =
						row.call?.unscoredReason === null &&
						(status === "resolved" || status === "disputed")
					return standing
						? [[row.callId, { length: row.length, family: row.family }]]
						: []
				}),
			)
			return ids.map((id) => markByCallId.get(id) ?? null)
		})
		callStreakLoaders.set(ctx, loader)
	}
	return loader
}

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
// per call just to read that call's question's leagueId - unbatched. This
// fact has no viewer dependency at all, so it's a plain per-request
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

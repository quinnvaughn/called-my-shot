import {
	isSeasonLongShape,
	STREAK_TAG_MIN,
	type StreakFamily,
} from "@called-my-shot/scoring"
import { and, count, eq, inArray, lte, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "../../../db"
import {
	callSelections,
	calls,
	games,
	questionOptions,
} from "../../../db/schema"
import { loadCallSides } from "../../../lib/fades"
import { aggregatePointsByUser } from "../../../lib/points-aggregate"
import { accuracyFrom } from "../../../lib/scoring"
import type { Context } from "../../context"
import { ctxLoader, groupByKey, indexByKey } from "../../loader"

export type CallStreakMark = { length: number; family: StreakFamily }

// Question.viewerStreak - a user's own track for a question's league and
// family, keyed "<userId>:<leagueId>:<family>". One read of their streaks per
// request however many questions on the page ask.
export const viewerStreakLoader = ctxLoader(async (keys: string[]) => {
	const parts = keys.map((key) => key.split(":"))
	const rows = await db.query.userStreaks.findMany({
		where: {
			userId: { in: [...new Set(parts.map(([userId]) => userId ?? ""))] },
			leagueId: {
				in: [...new Set(parts.map(([, leagueId]) => leagueId ?? ""))],
			},
		},
	})
	return indexByKey(
		keys,
		rows,
		(row) => `${row.userId}:${row.leagueId}:${row.family}`,
		null,
	)
})

// Call.streak, on every call card in a feed - one batched read of the streak
// cache per request rather than one per card. Null unless the call is at
// least STREAK_TAG_MIN into a run, and unless its result still stands: the
// cache is rebuilt shortly after a result changes, not in the same
// transaction, so a call voided a moment ago can briefly still have a row.
export const callStreakLoader = ctxLoader(
	async (callIds: string[]): Promise<(CallStreakMark | null)[]> => {
		const rows = await db.query.callStreakPositions.findMany({
			where: { callId: { in: callIds }, length: { gte: STREAK_TAG_MIN } },
			columns: { callId: true, length: true, family: true },
			with: {
				call: {
					columns: { unscoredReason: true },
					with: { question: { columns: { status: true } } },
				},
			},
		})
		const standing = rows.filter((row) => {
			const status = row.call?.question?.status
			return (
				row.call?.unscoredReason === null &&
				(status === "resolved" || status === "disputed")
			)
		})
		return indexByKey(callIds, standing, (row) => row.callId, null).map(
			(row) => (row ? { length: row.length, family: row.family } : null),
		)
	},
)

// QuestionOption.fieldPct's numerator - grouped COUNT per option.
export const optionSelectionCountLoader = ctxLoader(
	async (optionIds: string[]) => {
		const rows = await db
			.select({ optionId: callSelections.optionId, n: count() })
			.from(callSelections)
			.where(inArray(callSelections.optionId, optionIds))
			.groupBy(callSelections.optionId)
		return indexByKey(optionIds, rows, (r) => r.optionId, null).map(
			(r) => r?.n ?? 0,
		)
	},
)

// QuestionOption.fieldPct's denominator - grouped COUNT per question.
export const questionCallCountLoader = ctxLoader(
	async (questionIds: string[]) => {
		const rows = await db
			.select({ questionId: calls.questionId, n: count() })
			.from(calls)
			.where(inArray(calls.questionId, questionIds))
			.groupBy(calls.questionId)
		return indexByKey(questionIds, rows, (r) => r.questionId, null).map(
			(r) => r?.n ?? 0,
		)
	},
)

// averageGuess/numericHitRatePct/guessDistribution all read the same rows,
// so they share one batched query per request.
export const questionGuessCallsLoader = ctxLoader(
	async (questionIds: string[]) => {
		const rows = await db.query.calls.findMany({
			where: { questionId: { in: questionIds } },
			columns: { questionId: true, guessValue: true, hitTolerance: true },
		})
		return groupByKey(questionIds, rows, (row) => row.questionId)
	},
)

// Call's question-level facts (its league, and the season window for the
// season-long fields) without loading the whole question per call.
const questionFactsLoader = ctxLoader(async (questionIds: string[]) => {
	const rows = await db.query.questions.findMany({
		where: { id: { in: questionIds } },
		columns: {
			id: true,
			leagueId: true,
			shape: true,
			seasonId: true,
			locksAt: true,
			// Call.payout prices a pending pick's miss at it, off the base
			// isOfficial and shape decide together.
			lossRate: true,
			isOfficial: true,
			// Call.viewerCanRedo needs it: a question voided while still open
			// has a future locksAt but takes no redos, and the clock alone
			// can't tell that apart from one still running.
			status: true,
		},
	})
	return indexByKey(questionIds, rows, (q) => q.id, undefined)
})

export function loadQuestionFacts(ctx: Context, questionId: string) {
	return questionFactsLoader(ctx).load(questionId)
}

// Call.currentRank - each call's 1-indexed position among every call on its
// question, one grouped query for a feed of cards rather than a COUNT each.
// A self-join, so both sides of the createdAt comparison stay in Postgres:
// it keeps microseconds and a JS Date holds milliseconds, so a value
// round-tripped through JS can land below the row's own timestamp and drop
// the call out of its own count.
export const callRankLoader = ctxLoader(async (callIds: string[]) => {
	const others = alias(calls, "others")
	const rows = await db
		.select({ callId: calls.id, n: count() })
		.from(calls)
		.innerJoin(
			others,
			and(
				eq(others.questionId, calls.questionId),
				lte(others.createdAt, calls.createdAt),
			),
		)
		.where(inArray(calls.id, callIds))
		.groupBy(calls.id)
	return indexByKey(callIds, rows, (r) => r.callId, null).map((r) => r?.n ?? 0)
})

// The option count tierFor normalises a pick's field share against, for
// Call.payout. Counted in SQL so a season award's whole-league pool isn't
// loaded row by row to be measured.
export const questionOptionCountLoader = ctxLoader(
	async (questionIds: string[]) => {
		const rows = await db
			.select({ questionId: questionOptions.questionId, n: count() })
			.from(questionOptions)
			.where(inArray(questionOptions.questionId, questionIds))
			.groupBy(questionOptions.questionId)
		return indexByKey(questionIds, rows, (r) => r.questionId, null).map(
			(r) => r?.n ?? 0,
		)
	},
)

// The option behind each of a feed's pending picks, for Call.payout.
export const questionOptionLoader = ctxLoader(async (optionIds: string[]) => {
	const rows = await db.query.questionOptions.findMany({
		where: { id: { in: optionIds } },
		columns: { id: true, questionId: true, lossRate: true },
	})
	return indexByKey(optionIds, rows, (row) => row.id, undefined)
})

// Question.scoredOptions - the options carrying a number once a question has
// settled. Filtered in SQL to the rows that have one, so a season award's
// whole-league pool (which never gets numbers) costs nothing, and trimmed by
// shape in the resolver. A game leader's pool does get a number per player,
// which is why this is a loader and not a walk over Question.options: the
// pages that show a result show many of them at once.
export const scoredOptionsLoader = ctxLoader(async (questionIds: string[]) => {
	const rows = await db.query.questionOptions.findMany({
		where: {
			questionId: { in: questionIds },
			actualValue: { isNotNull: true },
		},
	})
	return groupByKey(questionIds, rows, (row) => row.questionId)
})

// Call.totalPoints sums a call's selections.
export const callSelectionsLoader = ctxLoader(async (callIds: string[]) => {
	const rows = await db.query.callSelections.findMany({
		where: { callId: { in: callIds } },
	})
	return groupByKey(callIds, rows, (row) => row.callId)
})

// Call.redo - null on almost every call, so this exists to keep a feed of
// cards from firing one "was this redone" query each. Batched the same way
// callSelectionsLoader is.
export const callRedoLoader = ctxLoader(async (callIds: string[]) => {
	const rows = await db.query.callRedos.findMany({
		where: { callId: { in: callIds } },
	})
	return indexByKey(callIds, rows, (row) => row.callId, null)
})

// The picks a call had before its redo. Separate from callRedoLoader because
// a feed only needs to know THAT a call was redone (the badge), while the
// call page needs what it used to say - loading the selections for every card
// in a feed to render a badge would be waste.
export const callRedoSelectionsLoader = ctxLoader(async (redoIds: string[]) => {
	const rows = await db.query.callRedoSelections.findMany({
		where: { redoId: { in: redoIds } },
	})
	return groupByKey(redoIds, rows, (row) => row.redoId)
})

// Call.callerLeagueAccuracy - keyed "<userId>:<leagueId>", one aggregate per
// league on the page rather than one per call.
export const callerLeagueAccuracyLoader = ctxLoader(async (keys: string[]) => {
	const usersByLeague = new Map<string, Set<string>>()
	for (const key of keys) {
		const [userId = "", leagueId = ""] = key.split(":")
		const users = usersByLeague.get(leagueId) ?? new Set<string>()
		users.add(userId)
		usersByLeague.set(leagueId, users)
	}
	const accuracyByKey = new Map<string, number | null>()
	await Promise.all(
		[...usersByLeague].map(async ([leagueId, userIds]) => {
			const agg = await aggregatePointsByUser({
				userIds: [...userIds],
				leagueIds: [leagueId],
			})
			for (const [userId, summary] of agg) {
				accuracyByKey.set(`${userId}:${leagueId}`, accuracyFrom(summary))
			}
		}),
	)
	return keys.map((key) => accuracyByKey.get(key) ?? null)
})

// A season-long question's game window: every game of its season scheduled
// by its locksAt (the same window resolveQuestionInternal bounds by at real
// resolution time), and how many of those were final by `playedBy`.
export type SeasonWindowKey = {
	seasonId: string
	locksAt: Date
	playedBy: Date
}
const seasonWindowLoader = ctxLoader(
	async (keys: SeasonWindowKey[]) => {
		// games.startsAt is a timestamp without time zone holding UTC, so the
		// bounds go in as UTC wall-clock values too.
		const values = sql.join(
			keys.map(
				(key, index) =>
					sql`(${index}::int, ${key.seasonId}::uuid, ${key.locksAt.toISOString()}::timestamp, ${key.playedBy.toISOString()}::timestamp)`,
			),
			sql`, `,
		)
		const result = await db.execute<{
			idx: number
			total: number
			played: number
		}>(sql`
			select
				k.idx,
				count(g.id)::int as total,
				count(g.id) filter (
					where g.status = 'final' and g.starts_at <= k.played_by
				)::int as played
			from (values ${values}) as k(idx, season_id, locks_at, played_by)
			left join ${games} g
				on g.season_id = k.season_id and g.starts_at <= k.locks_at
			group by k.idx
		`)
		const byIndex = new Map(result.rows.map((row) => [row.idx, row]))
		return keys.map((_, index) => {
			const row = byIndex.get(index)
			return { total: row?.total ?? 0, played: row?.played ?? 0 }
		})
	},
	{
		cacheKeyFn: (key) =>
			`${key.seasonId}|${key.locksAt.getTime()}|${key.playedBy.getTime()}`,
	},
)

// The season window for a question, or null for one that isn't season-long
// (neither count means anything for a single game).
export function loadSeasonWindow(
	ctx: Context,
	question: { shape: Parameters<typeof isSeasonLongShape>[0] } & Omit<
		SeasonWindowKey,
		"playedBy"
	>,
	playedBy: Date,
) {
	if (!isSeasonLongShape(question.shape)) return null
	return seasonWindowLoader(ctx).load({
		seasonId: question.seasonId,
		locksAt: question.locksAt,
		playedBy,
	})
}

// Call.doubters - every fade aimed at a call, oldest first.
export const fadesByTargetLoader = ctxLoader(async (callIds: string[]) => {
	const rows = await db.query.callFades.findMany({
		where: { targetCallId: { in: callIds } },
		orderBy: { createdAt: "asc" },
	})
	return groupByKey(callIds, rows, (row) => row.targetCallId)
})

// Call.fading - the one fade a call carries, if it was aimed at anyone.
export const fadeByFaderLoader = ctxLoader(async (callIds: string[]) => {
	const rows = await db.query.callFades.findMany({
		where: { faderCallId: { in: callIds } },
	})
	return indexByKey(callIds, rows, (row) => row.faderCallId, null)
})

// Which side each call is on, for everything that compares two calls in a
// fade (who won, whether a viewer is on the other side).
export const callSideLoader = ctxLoader(async (callIds: string[]) => {
	const sides = await loadCallSides(db, callIds)
	return callIds.map((id) => sides.get(id) ?? null)
})

// A viewer's own call on a question, keyed "<userId>:<questionId>" - what
// Call.fadeOffer checks to tell a new caller from one who already picked.
export const userQuestionCallLoader = ctxLoader(async (keys: string[]) => {
	const parts = keys.map((key) => key.split(":"))
	const rows = await db.query.calls.findMany({
		where: {
			userId: { in: [...new Set(parts.map(([userId]) => userId ?? ""))] },
			questionId: {
				in: [...new Set(parts.map(([, questionId]) => questionId ?? ""))],
			},
		},
	})
	return indexByKey(
		keys,
		rows,
		(row) => `${row.userId}:${row.questionId}`,
		null,
	)
})

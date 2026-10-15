import {
	and,
	eq,
	gt,
	inArray,
	isNotNull,
	lte,
	notExists,
	sql,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "../db"
import { callSelections, calls, type Question, questions } from "../db/schema"

// The group rail's "Still open": questions about to lock that the viewer
// hasn't called and enough of their group has, with where the group landed
// on each. Every call is public (see loadGroupPicks), so this shows nothing a
// member's own profile wouldn't.

// The same window as the leagues' Closing soon row.
export const STILL_OPEN_WINDOW_MS = 48 * 60 * 60 * 1000

// Members who have to be in before a question makes the list. One is a
// person, not a group read.
export const STILL_OPEN_MIN_MEMBERS = 2

export type StillOpenQuestion = {
	question: Question
	// Members with a call on it.
	memberCount: number
	// Members per option, most picked first. A multi-pick call counts toward
	// each option it took.
	picks: { optionId: string; count: number }[]
	// The members' middle guess on a numeric question, null on any other.
	medianGuess: number | null
}

// How lopsided the group is: the leading option's lead over the next, as a
// share of the members in. Zero is an even split. Null for a numeric
// question, which has no sides.
function splitMargin(entry: StillOpenQuestion): number | null {
	if (entry.medianGuess !== null || entry.picks.length === 0) return null
	const [first, second] = entry.picks
	return ((first?.count ?? 0) - (second?.count ?? 0)) / entry.memberCount
}

// Soonest lock first, so the list reads as a to-do; on the same lock, the
// closest split first, since that's the one with the most to settle.
function compareStillOpen(a: StillOpenQuestion, b: StillOpenQuestion) {
	const byLock = a.question.locksAt.getTime() - b.question.locksAt.getTime()
	if (byLock !== 0) return byLock
	const marginA = splitMargin(a) ?? Number.POSITIVE_INFINITY
	const marginB = splitMargin(b) ?? Number.POSITIVE_INFINITY
	if (marginA !== marginB) return marginA - marginB
	return a.question.id.localeCompare(b.question.id)
}

export async function loadStillOpen(
	viewerId: string,
	memberIds: string[],
	leagueIds: string[] | null,
	now: Date = new Date(),
): Promise<StillOpenQuestion[]> {
	const mates = memberIds.filter((id) => id !== viewerId)
	if (mates.length < STILL_OPEN_MIN_MEMBERS) return []

	const viewerCalls = alias(calls, "viewer_calls")
	const memberCount = sql<number>`count(distinct ${calls.userId})::int`
	const counted = await db
		.select({ questionId: calls.questionId, memberCount })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(
			and(
				inArray(calls.userId, mates),
				eq(questions.status, "open"),
				gt(questions.locksAt, now),
				lte(
					questions.locksAt,
					new Date(now.getTime() + STILL_OPEN_WINDOW_MS),
				),
				leagueIds ? inArray(questions.leagueId, leagueIds) : undefined,
				notExists(
					db
						.select({ id: viewerCalls.id })
						.from(viewerCalls)
						.where(
							and(
								eq(viewerCalls.questionId, calls.questionId),
								eq(viewerCalls.userId, viewerId),
							),
						),
				),
			),
		)
		.groupBy(calls.questionId)
		.having(sql`${memberCount} >= ${STILL_OPEN_MIN_MEMBERS}`)
	if (counted.length === 0) return []
	const questionIds = counted.map((row) => row.questionId)

	const [questionRows, pickRows, medianRows] = await Promise.all([
		db.query.questions.findMany({ where: { id: { in: questionIds } } }),
		db
			.select({
				questionId: calls.questionId,
				optionId: callSelections.optionId,
				count: memberCount,
			})
			.from(calls)
			.innerJoin(callSelections, eq(callSelections.callId, calls.id))
			.where(
				and(
					inArray(calls.questionId, questionIds),
					inArray(calls.userId, mates),
				),
			)
			.groupBy(calls.questionId, callSelections.optionId),
		db
			.select({
				questionId: calls.questionId,
				median: sql<number>`percentile_cont(0.5) within group (order by ${calls.guessValue})::float`,
			})
			.from(calls)
			.where(
				and(
					inArray(calls.questionId, questionIds),
					inArray(calls.userId, mates),
					isNotNull(calls.guessValue),
				),
			)
			.groupBy(calls.questionId),
	])

	const questionById = new Map(questionRows.map((q) => [q.id, q]))
	const medianById = new Map(
		medianRows.map((row) => [row.questionId, Number(row.median)]),
	)
	const picksById = new Map<string, { optionId: string; count: number }[]>()
	for (const row of pickRows) {
		const list = picksById.get(row.questionId) ?? []
		list.push({ optionId: row.optionId, count: Number(row.count) })
		picksById.set(row.questionId, list)
	}

	return counted
		.flatMap((row) => {
			const question = questionById.get(row.questionId)
			if (!question) return []
			const picks = (picksById.get(row.questionId) ?? []).sort(
				(a, b) => b.count - a.count || a.optionId.localeCompare(b.optionId),
			)
			return [
				{
					question,
					memberCount: Number(row.memberCount),
					picks,
					medianGuess: medianById.get(row.questionId) ?? null,
				},
			]
		})
		.sort(compareStillOpen)
}

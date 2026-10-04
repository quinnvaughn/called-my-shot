import { and, asc, desc, eq, gt, inArray, notExists, sql } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../db"
import {
	type Call,
	calls,
	type Question,
	questionShares,
	questions,
} from "../db/schema"
import { callablePins, memberCallCounts } from "./group-pins"

// How long a question has to stay open for the welcome modal to offer it:
// enough to read it, pick, and set conviction without it locking mid-call.
export const WELCOME_MIN_LEAD_MINUTES = 30

export type WelcomeSource = "PINNED" | "SUGGESTED"

export type GroupWelcome = {
	inviterId: string | null
	question: Question | null
	source: WelcomeSource | null
	inviterCall: Call | null
	memberCallCount: number
	// Pins the viewer could still call besides the one offered.
	otherPinnedCount: number
}

// The one question a new member is asked to call in the welcome modal.
// Eligible: open for at least WELCOME_MIN_LEAD_MINUTES more, in a league the
// group tracks, and not already called by the viewer. The group's pins come
// first, in the admins' order. Without one, it suggests the question most
// tied to the group: shared to it first, then most called by its members,
// then soonest to lock, so the first result comes back quickly.
export async function selectGroupWelcome({
	groupId,
	viewerId,
	inviterId,
	trackedLeagueIds,
	memberIds,
	now = new Date(),
}: {
	groupId: string
	viewerId: string
	inviterId: string | null
	trackedLeagueIds: string[] | null
	memberIds: string[]
	now?: Date
}): Promise<GroupWelcome> {
	const cutoff = DateTime.fromJSDate(now)
		.plus({ minutes: WELCOME_MIN_LEAD_MINUTES })
		.toJSDate()

	const pinned = (await callablePins(groupId, cutoff))
		.map((row) => row.question)
		.filter((q) => !trackedLeagueIds || trackedLeagueIds.includes(q.leagueId))
	const calledPins =
		pinned.length > 0
			? await db.query.calls.findMany({
					where: {
						userId: viewerId,
						questionId: { in: pinned.map((q) => q.id) },
					},
					columns: { questionId: true },
				})
			: []
	const called = new Set(calledPins.map((c) => c.questionId))
	const eligiblePins = pinned.filter((q) => !called.has(q.id))

	let question: Question | null = eligiblePins[0] ?? null
	let source: WelcomeSource | null = question ? "PINNED" : null
	if (!question) {
		question = await suggestQuestion({
			groupId,
			viewerId,
			trackedLeagueIds,
			memberIds,
			cutoff,
		})
		source = question ? "SUGGESTED" : null
	}
	if (!question) {
		return {
			inviterId,
			question: null,
			source: null,
			inviterCall: null,
			memberCallCount: 0,
			otherPinnedCount: 0,
		}
	}

	const [inviterCall, counts] = await Promise.all([
		inviterId
			? db.query.calls.findFirst({
					where: { questionId: question.id, userId: inviterId },
				})
			: Promise.resolve(undefined),
		memberCallCounts([question.id], memberIds),
	])
	return {
		inviterId,
		question,
		source,
		inviterCall: inviterCall ?? null,
		memberCallCount: counts.get(question.id) ?? 0,
		otherPinnedCount: source === "PINNED" ? eligiblePins.length - 1 : 0,
	}
}

async function suggestQuestion({
	groupId,
	viewerId,
	trackedLeagueIds,
	memberIds,
	cutoff,
}: {
	groupId: string
	viewerId: string
	trackedLeagueIds: string[] | null
	memberIds: string[]
	cutoff: Date
}): Promise<Question | null> {
	// Only members' calls are joined, so a question with thousands of calls
	// from outside the group costs no more to rank than one with none.
	const memberCallJoin =
		memberIds.length > 0
			? and(
					eq(calls.questionId, questions.id),
					inArray(calls.userId, memberIds),
				)
			: sql`false`
	const viewerCall = db
		.select({ one: sql`1` })
		.from(calls)
		.where(and(eq(calls.questionId, questions.id), eq(calls.userId, viewerId)))

	const [row] = await db
		.select({ question: questions })
		.from(questions)
		.leftJoin(
			questionShares,
			and(
				eq(questionShares.questionId, questions.id),
				eq(questionShares.groupId, groupId),
			),
		)
		.leftJoin(calls, memberCallJoin)
		.where(
			and(
				eq(questions.status, "open"),
				gt(questions.locksAt, cutoff),
				trackedLeagueIds
					? inArray(questions.leagueId, trackedLeagueIds)
					: undefined,
				notExists(viewerCall),
			),
		)
		.groupBy(questions.id, questionShares.id)
		.orderBy(
			desc(sql`${questionShares.id} is not null`),
			desc(sql`count(${calls.id})`),
			asc(questions.locksAt),
			asc(questions.id),
		)
		.limit(1)
	return row?.question ?? null
}

import { and, count, eq, or, sum } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
	calls,
	groupMembers,
	type Presser,
	presserQuestions,
	questions,
	type User,
	userBlocks,
	userSeasonStats,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { DAY_MS } from "../time"
import { isPresserOpen } from "./app-questions"
import {
	MIN_ACCOUNT_AGE_DAYS,
	MIN_SETTLED_CALLS,
	SORT_RANK,
	STRANGER_QUESTION_CAP,
} from "./constants"

export type PresserAskStatus =
	| "can_ask"
	| "signed_out"
	| "own_presser"
	| "closed"
	| "already_asked"
	| "blocked"
	| "not_eligible"
	| "new_account"
	| "stranger_cap_reached"

export type AskEligibility =
	| { status: Exclude<PresserAskStatus, "can_ask"> }
	| {
			status: "can_ask"
			source: "group" | "game_caller"
			sortRank: number
	  }

export async function isBlockedEitherWay(
	q: DbOrTx,
	a: string,
	b: string,
): Promise<boolean> {
	const [row] = await q
		.select({ blockerId: userBlocks.blockerId })
		.from(userBlocks)
		.where(
			or(
				and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
				and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
			),
		)
		.limit(1)
	return row !== undefined
}

export async function sharesGroup(
	q: DbOrTx,
	a: string,
	b: string,
): Promise<boolean> {
	const other = alias(groupMembers, "other_member")
	const [row] = await q
		.select({ groupId: groupMembers.groupId })
		.from(groupMembers)
		.innerJoin(other, eq(other.groupId, groupMembers.groupId))
		.where(and(eq(groupMembers.userId, a), eq(other.userId, b)))
		.limit(1)
	return row !== undefined
}

async function calledGame(
	q: DbOrTx,
	userId: string,
	gameId: string,
): Promise<boolean> {
	const [row] = await q
		.select({ id: calls.id })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(and(eq(calls.userId, userId), eq(questions.gameId, gameId)))
		.limit(1)
	return row !== undefined
}

async function settledCallCount(q: DbOrTx, userId: string): Promise<number> {
	const [row] = await q
		.select({ n: sum(userSeasonStats.resolvedCallCount) })
		.from(userSeasonStats)
		.where(eq(userSeasonStats.userId, userId))
	return Number(row?.n ?? 0)
}

export async function strangerQuestionCount(
	q: DbOrTx,
	presserId: string,
): Promise<number> {
	const [row] = await q
		.select({ n: count() })
		.from(presserQuestions)
		.where(
			and(
				eq(presserQuestions.presserId, presserId),
				eq(presserQuestions.source, "game_caller"),
			),
		)
	return row?.n ?? 0
}

// Whether `viewer` can ask a question at `presser`, and as whom. Checked in
// this order so the reason shown is the most useful one: a groupmate who
// already asked hears "already asked", not something about their account.
export async function askEligibility(
	q: DbOrTx,
	viewer: Pick<User, "id" | "createdAt"> | null,
	presser: Presser,
	now = new Date(),
): Promise<AskEligibility> {
	if (!viewer) return { status: "signed_out" }
	if (viewer.id === presser.userId) return { status: "own_presser" }
	if (!isPresserOpen(presser, now)) return { status: "closed" }

	const [asked] = await q
		.select({ id: presserQuestions.id })
		.from(presserQuestions)
		.where(
			and(
				eq(presserQuestions.presserId, presser.id),
				eq(presserQuestions.askerId, viewer.id),
			),
		)
		.limit(1)
	if (asked) return { status: "already_asked" }
	if (await isBlockedEitherWay(q, viewer.id, presser.userId)) {
		return { status: "blocked" }
	}
	if (await sharesGroup(q, viewer.id, presser.userId)) {
		return { status: "can_ask", source: "group", sortRank: SORT_RANK.groupmate }
	}

	if (!(await calledGame(q, viewer.id, presser.gameId))) {
		return { status: "not_eligible" }
	}
	const oldEnough =
		now.getTime() - viewer.createdAt.getTime() >= MIN_ACCOUNT_AGE_DAYS * DAY_MS
	if (
		!oldEnough ||
		(await settledCallCount(q, viewer.id)) < MIN_SETTLED_CALLS
	) {
		return { status: "new_account" }
	}
	if ((await strangerQuestionCount(q, presser.id)) >= STRANGER_QUESTION_CAP) {
		return { status: "stranger_cap_reached" }
	}
	return {
		status: "can_ask",
		source: "game_caller",
		sortRank: SORT_RANK.gameCaller,
	}
}

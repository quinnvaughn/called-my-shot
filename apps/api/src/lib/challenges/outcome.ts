import { and, eq, inArray, sql } from "drizzle-orm"
import { match, P } from "ts-pattern"
import { db } from "../../db"
import {
	callSelections,
	calls,
	challengeQuestions,
	type Question,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"

export type ChallengeQuestionFacts = Pick<
	Question,
	"id" | "status" | "locksAt" | "resolvedAt"
>

// open: still taking people. live: closed, with a question still to settle.
// settled: every question that wasn't voided has a result. voided: none of
// them count.
export type ChallengeState = "open" | "live" | "settled" | "voided"

// Who a 1v1 went to, once it's settled.
export type MatchupOutcome = "creator" | "acceptor" | "draw"

export type Record3 = { wins: number; losses: number; draws: number }

const counted = (questions: ChallengeQuestionFacts[]) =>
	questions.filter((q) => q.status !== "voided")

// A challenge takes new people until the first of its questions locks, read
// off locksAt rather than status: the column lags the clock by up to the
// lock job's interval, and a rescheduled game moves the close with it.
export function challengeClosesAt(
	questions: ChallengeQuestionFacts[],
): Date | null {
	const live = counted(questions)
	if (live.length === 0) return null
	return new Date(Math.min(...live.map((q) => q.locksAt.getTime())))
}

export function challengeState(
	questions: ChallengeQuestionFacts[],
	now = new Date(),
): ChallengeState {
	const live = counted(questions)
	if (live.length === 0) return "voided"
	const closesAt = challengeClosesAt(questions)
	if (closesAt && now < closesAt && live.every((q) => q.status === "open")) {
		return "open"
	}
	// disputed counts as having a result: the result stands until an admin
	// overturns it, and an overturn rescores the calls.
	return live.some((q) => q.status === "open" || q.status === "locked")
		? "live"
		: "settled"
}

// When the last question that counts got its result. Null until settled.
export function challengeSettledAt(
	questions: ChallengeQuestionFacts[],
): Date | null {
	if (challengeState(questions) !== "settled") return null
	const times = counted(questions).flatMap((q) =>
		q.resolvedAt ? [q.resolvedAt.getTime()] : [],
	)
	return times.length > 0 ? new Date(Math.max(...times)) : null
}

export function matchupOutcome(
	creatorPoints: number,
	acceptorPoints: number,
): MatchupOutcome {
	return match(Math.sign(creatorPoints - acceptorPoints))
		.with(1, () => "creator" as const)
		.with(-1, () => "acceptor" as const)
		.otherwise(() => "draw" as const)
}

// One person's challenge points on each question of a challenge. A question
// they haven't called, or that hasn't settled, is null: it counts as 0
// toward their total, the same as never calling it.
export type ChallengePoints = {
	total: number
	byQuestionId: Map<string, number | null>
}

const pointsKey = (challengeId: string, userId: string) =>
	`${challengeId}:${userId}`

// Every listed person's challenge points on every listed challenge, keyed by
// pointsKey. A call's points are its own column for a numeric guess and the
// sum of its selections for everything else; only one of the two is ever
// set, which is what lets one coalesce read both.
export async function loadChallengePoints(
	challengeIds: string[],
	userIds: string[],
	executor: DbOrTx = db,
): Promise<(challengeId: string, userId: string) => ChallengePoints> {
	const rows =
		challengeIds.length === 0 || userIds.length === 0
			? []
			: await executor
					.select({
						challengeId: challengeQuestions.challengeId,
						questionId: challengeQuestions.questionId,
						userId: calls.userId,
						points: sql<
							number | null
						>`sum(coalesce(${callSelections.challengePoints}, ${calls.challengePoints}))::int`,
					})
					.from(challengeQuestions)
					.innerJoin(
						calls,
						and(
							eq(calls.questionId, challengeQuestions.questionId),
							inArray(calls.userId, userIds),
						),
					)
					.leftJoin(callSelections, eq(callSelections.callId, calls.id))
					.where(inArray(challengeQuestions.challengeId, challengeIds))
					.groupBy(
						challengeQuestions.challengeId,
						challengeQuestions.questionId,
						calls.userId,
					)

	const byKey = new Map<string, ChallengePoints>()
	for (const row of rows) {
		const key = pointsKey(row.challengeId, row.userId)
		const entry = byKey.get(key) ?? { total: 0, byQuestionId: new Map() }
		entry.byQuestionId.set(row.questionId, row.points)
		entry.total += row.points ?? 0
		byKey.set(key, entry)
	}
	return (challengeId, userId) =>
		byKey.get(pointsKey(challengeId, userId)) ?? {
			total: 0,
			byQuestionId: new Map(),
		}
}

export type Matchup<A> = {
	acceptance: A
	creator: ChallengePoints
	acceptor: ChallengePoints
	// Null until the challenge settles.
	outcome: MatchupOutcome | null
}

// Each acceptance as a 1v1 against the creator.
export function buildMatchups<A extends { acceptorId: string }>(input: {
	challengeId: string
	creatorId: string
	state: ChallengeState
	acceptances: A[]
	pointsOf: (challengeId: string, userId: string) => ChallengePoints
}): Matchup<A>[] {
	const creator = input.pointsOf(input.challengeId, input.creatorId)
	return input.acceptances.map((acceptance) => {
		const acceptor = input.pointsOf(input.challengeId, acceptance.acceptorId)
		return {
			acceptance,
			creator,
			acceptor,
			outcome:
				input.state === "settled"
					? matchupOutcome(creator.total, acceptor.total)
					: null,
		}
	})
}

// How the creator did against everyone who took them on.
export function creatorTally(
	matchups: { outcome: MatchupOutcome | null }[],
): Record3 {
	const tally = { wins: 0, losses: 0, draws: 0 }
	for (const { outcome } of matchups) {
		match(outcome)
			.with("creator", () => tally.wins++)
			.with("acceptor", () => tally.losses++)
			.with("draw", () => tally.draws++)
			.with(P.nullish, () => {})
			.exhaustive()
	}
	return tally
}

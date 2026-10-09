import {
	and,
	count,
	eq,
	gt,
	inArray,
	isNotNull,
	not,
	or,
	type SQL,
	sql,
} from "drizzle-orm"
import { db } from "../db"
import {
	type Ballot,
	ballots,
	calls,
	type GroupPin,
	groupPins,
	type Question,
	questions,
} from "../db/schema"
import type { DbOrTx } from "../db/types"
import { createNotifications } from "./notifications"
import { utcTimestamp } from "./outbox"

// Whether a ballot has a member that can still be called, by the clock
// rather than the status column alone, like callablePinWhere below.
export function ballotHasOpenMember(ballotId: SQL | string, now: Date) {
	return sql`exists (
		select 1 from ballot_questions bq
		join questions mq on mq.id = bq.question_id
		where bq.ballot_id = ${ballotId}
			and mq.status = 'open'
			and mq.locks_at > ${utcTimestamp(now)}
	)`
}

// A pin counts only while it can still be called: a question until it locks,
// a published ballot while any member is open. The same clock-not-column
// test castCall applies, since lock-overdue-questions only flips status every
// 15 minutes. Reads questions and ballots joined onto group_pins by their
// pin columns.
function callablePinWhere(now: Date) {
	return or(
		and(
			isNotNull(groupPins.questionId),
			eq(questions.status, "open"),
			gt(questions.locksAt, now),
		),
		and(
			isNotNull(groupPins.ballotId),
			eq(ballots.status, "published"),
			ballotHasOpenMember(sql`${groupPins.ballotId}`, now),
		),
	)
}

export type CallablePin =
	| { pin: GroupPin; question: Question; ballot: null }
	| { pin: GroupPin; question: null; ballot: Ballot }

// What a pin points at: the id GroupPin is addressed by, and the league it
// belongs to.
export function pinTarget(row: CallablePin): { id: string; leagueId: string } {
	return row.question
		? { id: row.question.id, leagueId: row.question.leagueId }
		: { id: row.ballot.id, leagueId: row.ballot.leagueId }
}

// The group's pins that can still be called, in display order.
export async function callablePins(
	groupId: string,
	now: Date,
	executor: DbOrTx = db,
): Promise<CallablePin[]> {
	const rows = await executor
		.select({ pin: groupPins, question: questions, ballot: ballots })
		.from(groupPins)
		.leftJoin(questions, eq(questions.id, groupPins.questionId))
		.leftJoin(ballots, eq(ballots.id, groupPins.ballotId))
		.where(and(eq(groupPins.groupId, groupId), callablePinWhere(now)))
		.orderBy(groupPins.position, groupPins.createdAt)
	return rows.flatMap((row): CallablePin[] => {
		if (row.question)
			return [{ pin: row.pin, question: row.question, ballot: null }]
		if (row.ballot)
			return [{ pin: row.pin, question: null, ballot: row.ballot }]
		return []
	})
}

// How many of `memberIds` have called each question, zero included.
export async function memberCallCounts(
	questionIds: string[],
	memberIds: string[],
): Promise<Map<string, number>> {
	const counts = new Map(questionIds.map((id) => [id, 0]))
	if (questionIds.length === 0 || memberIds.length === 0) return counts
	const rows = await db
		.select({ questionId: calls.questionId, n: count() })
		.from(calls)
		.where(
			and(
				inArray(calls.questionId, questionIds),
				inArray(calls.userId, memberIds),
			),
		)
		.groupBy(calls.questionId)
	for (const row of rows) counts.set(row.questionId, row.n)
	return counts
}

// How many of `memberIds` have started each ballot, and how many have called
// every one of its members, zeros included.
export async function memberBallotProgress(
	ballotIds: string[],
	memberIds: string[],
): Promise<Map<string, { started: number; finished: number }>> {
	const progress = new Map(
		ballotIds.map((id) => [id, { started: 0, finished: 0 }]),
	)
	if (ballotIds.length === 0 || memberIds.length === 0) return progress
	const { rows } = await db.execute<{
		ballot_id: string
		started: number
		finished: number
	}>(sql`
		with totals as (
			select ballot_id, count(*)::int as n
			from ballot_questions
			where ballot_id in ${ballotIds}
			group by ballot_id
		),
		per_user as (
			select bq.ballot_id, c.user_id, count(distinct c.question_id)::int as called
			from calls c
			join ballot_questions bq on bq.question_id = c.question_id
			where bq.ballot_id in ${ballotIds} and c.user_id in ${memberIds}
			group by bq.ballot_id, c.user_id
		)
		select per_user.ballot_id,
			count(*)::int as started,
			count(*) filter (where per_user.called = totals.n)::int as finished
		from per_user
		join totals on totals.ballot_id = per_user.ballot_id
		group by per_user.ballot_id
	`)
	for (const row of rows) {
		progress.set(row.ballot_id, {
			started: row.started,
			finished: row.finished,
		})
	}
	return progress
}

// Deletes every pin that can no longer be called (a question locked on the
// clock, resolved, or voided; a ballot with no open member left, or
// unpublished), then tells the admins of each group that just lost its last
// callable pin. Only pins this run deleted can trigger a
// notification, so running it twice sends nothing new.
export async function expireGroupPins({
	now = new Date(),
}: {
	now?: Date
} = {}): Promise<number> {
	return db.transaction(async (tx) => {
		const stale = await tx
			.select({ id: groupPins.id })
			.from(groupPins)
			.leftJoin(questions, eq(questions.id, groupPins.questionId))
			.leftJoin(ballots, eq(ballots.id, groupPins.ballotId))
			.where(not(callablePinWhere(now) ?? sql`false`))
		if (stale.length === 0) return 0

		const expired = await tx
			.delete(groupPins)
			.where(
				inArray(
					groupPins.id,
					stale.map((row) => row.id),
				),
			)
			.returning({ groupId: groupPins.groupId })
		if (expired.length === 0) return 0

		const groupIds = [...new Set(expired.map((row) => row.groupId))]
		const stillPinned = await tx
			.selectDistinct({ groupId: groupPins.groupId })
			.from(groupPins)
			.where(inArray(groupPins.groupId, groupIds))
		const pinned = new Set(stillPinned.map((row) => row.groupId))
		const emptied = groupIds.filter((id) => !pinned.has(id))
		if (emptied.length === 0) return expired.length

		const admins = await tx.query.groupMembers.findMany({
			where: { groupId: { in: emptied }, role: "admin" },
			columns: { userId: true, groupId: true },
			with: { group: { columns: { name: true } } },
		})
		await createNotifications(
			tx,
			admins.flatMap((admin) =>
				admin.group
					? [
							{
								type: "group_pins_expired" as const,
								userId: admin.userId,
								groupId: admin.groupId,
								groupName: admin.group.name,
							},
						]
					: [],
			),
		)
		return expired.length
	})
}

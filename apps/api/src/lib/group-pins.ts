import { and, count, eq, gt, inArray, lte, ne, or } from "drizzle-orm"
import { db } from "../db"
import { calls, groupPins, questions } from "../db/schema"
import type { DbOrTx } from "../db/types"
import { createNotifications } from "./notifications"

// A pin counts only while its question can still be called: the same
// clock-not-column test castCall applies, since lock-overdue-questions only
// flips status every 15 minutes.
export function callableQuestionWhere(now: Date) {
	return and(eq(questions.status, "open"), gt(questions.locksAt, now))
}

// The group's pins whose question can still be called, in display order.
export async function callablePins(
	groupId: string,
	now: Date,
	executor: DbOrTx = db,
) {
	const rows = await executor
		.select({ pin: groupPins, question: questions })
		.from(groupPins)
		.innerJoin(questions, eq(questions.id, groupPins.questionId))
		.where(and(eq(groupPins.groupId, groupId), callableQuestionWhere(now)))
		.orderBy(groupPins.position, groupPins.createdAt)
	return rows
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

// Deletes every pin whose question can no longer be called (locked on the
// clock, resolved, or voided), then tells the admins of each group that just
// lost its last callable pin. Only pins this run deleted can trigger a
// notification, so running it twice sends nothing new.
export async function expireGroupPins({
	now = new Date(),
}: {
	now?: Date
} = {}): Promise<number> {
	return db.transaction(async (tx) => {
		const stale = await tx
			.select({ questionId: groupPins.questionId })
			.from(groupPins)
			.innerJoin(questions, eq(questions.id, groupPins.questionId))
			.where(or(ne(questions.status, "open"), lte(questions.locksAt, now)))
		if (stale.length === 0) return 0

		const expired = await tx
			.delete(groupPins)
			.where(
				inArray(
					groupPins.questionId,
					stale.map((row) => row.questionId),
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

import { eq, type SQL, sql } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"
import { db } from "../../db"
import { type BallotQuestion, ballotQuestions } from "../../db/schema"
import type { DbOrTx, Tx } from "../../db/types"
import { ValidationError } from "../errors"

// One past the largest position already taken in an ordered list, or `first`
// when the list is empty - how a new ballot or ballot member lands at the end
// instead of jumping ahead of what's already there.
export async function nextPosition(
	tx: DbOrTx,
	table: PgTable,
	column: AnyPgColumn,
	where: SQL | undefined,
	first: number,
): Promise<number> {
	const [row] = await tx
		.select({ next: sql<number>`coalesce(max(${column}) + 1, ${first})` })
		.from(table)
		.where(where)
	return Number(row?.next ?? first)
}

// Appends a question to the end of a ballot. Positions within a ballot start
// at 0.
export async function attachToBallot(
	tx: Tx,
	params: {
		ballotId: string
		questionId: string
		label: string
		slot?: string | null
		section?: string | null
	},
): Promise<BallotQuestion> {
	const sortOrder = await nextPosition(
		tx,
		ballotQuestions,
		ballotQuestions.sortOrder,
		eq(ballotQuestions.ballotId, params.ballotId),
		0,
	)
	const [inserted] = await tx
		.insert(ballotQuestions)
		.values({
			ballotId: params.ballotId,
			questionId: params.questionId,
			label: params.label,
			slot: params.slot ?? null,
			section: params.section ?? null,
			sortOrder,
		})
		.returning()
	if (!inserted) throw new Error("attachToBallot: insert returned nothing")
	return inserted
}

// Rewrites a list's positions from its full ordered set of ids. A whole-set
// write is unambiguous about the result and can't leave gaps or duplicate
// positions behind, so the incoming set has to match what's there exactly.
export async function writeOrder(params: {
	currentIds: string[]
	orderedIds: string[]
	field: string
	mismatchMessage: string
	first: number
	setPosition: (tx: Tx, id: string, position: number) => Promise<unknown>
}): Promise<void> {
	const current = new Set(params.currentIds)
	const sameSet =
		params.orderedIds.length === current.size &&
		params.orderedIds.every((id) => current.has(id))
	if (!sameSet) {
		throw ValidationError.field(params.field, params.mismatchMessage)
	}

	await db.transaction(async (tx) => {
		await Promise.all(
			params.orderedIds.map((id, index) =>
				params.setPosition(tx, id, params.first + index),
			),
		)
	})
}

import { and, asc, inArray, isNull, lt, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../db"
import type {
	analyticsOutbox,
	emailOutbox,
	gameReminders,
	pushOutbox,
	seasonStartEmails,
	updateEmails,
} from "../db/schema"
import type { DbOrTx } from "../db/types"

// The send-later tables. Each has sentAt, attempts, lastError and createdAt:
// a row is pending while sentAt is null and attempts is under the table's
// cap, and finished (sent or deliberately skipped) once sentAt is stamped.
type OutboxTable =
	| typeof emailOutbox
	| typeof seasonStartEmails
	| typeof gameReminders
	| typeof updateEmails
	| typeof analyticsOutbox
	| typeof pushOutbox

// The ones that can finish without sending, recorded in skippedReason.
type SkippableOutboxTable = Exclude<OutboxTable, typeof analyticsOutbox>

type OutboxColumn<T extends OutboxTable> = PgColumn &
	T["_"]["columns"][keyof T["_"]["columns"]]

export type Outbox<T extends OutboxTable> = {
	table: T
	// The primary key's columns, in order.
	key: readonly [OutboxColumn<T>, ...OutboxColumn<T>[]]
	// A row that has failed this many times is left alone rather than retried
	// forever: by then it's a bad address or a template bug, and neither gets
	// better on the next pass.
	maxAttempts: number
}

// `now` as a UTC wall-clock timestamp, the form every `timestamp` column here
// is stored in. Bound as a parameter rather than read from SQL now(), so a
// drain's notion of the current time is the one its caller passed in.
export function utcTimestamp(now: Date): SQL {
	return sql`(${now.toISOString()}::timestamptz at time zone 'UTC')`
}

// Claims the oldest pending rows matching `where` and spends an attempt on
// each in the same statement, so a run that dies between here and the send
// has still burned one - a row that kills the process can't be retried
// forever.
//
// This is NOT mutual exclusion, despite looking like a claim: the UPDATE
// commits immediately and releases its row locks while the rows are still
// unsent, so a second drain started a moment later selects them again. That
// is exactly what shipped to production once - the scheduler runs on every
// machine and the same digest went out twice. What keeps two machines from
// sending the same row is the job lock every drain's callers take by name
// (lib/job-lock.ts).
export async function claimOutboxRows<T extends OutboxTable>(
	{ table, key, maxAttempts }: Outbox<T>,
	{ where, limit }: { where?: SQL; limit?: number } = {},
): Promise<T["$inferSelect"][]> {
	// Drizzle's builders resolve against the concrete union, not a generic
	// member of it. The rows returned are `table`'s own, hence the narrowing
	// back to T at the end.
	const t: OutboxTable = table
	let pending = db
		.select(Object.fromEntries(key.map((column, i) => [`k${i}`, column])))
		.from(t)
		.where(and(isNull(t.sentAt), lt(t.attempts, maxAttempts), where))
		.orderBy(asc(t.createdAt))
		.$dynamic()
	if (limit !== undefined) pending = pending.limit(limit)

	const rows = await db
		.update(t)
		.set({ attempts: sql`${t.attempts} + 1` })
		.where(
			inArray(
				sql`(${sql.join([...key], sql`, `)})`,
				pending.for("update", { skipLocked: true }),
			),
		)
		.returning()
	return rows as T["$inferSelect"][]
}

// Finished, with or without a send. A skip stamps sentAt alongside the reason
// so the row leaves the pending index - "we deliberately didn't send" is a
// finished state, not something to reconsider on the next pass - while
// skippedReason keeps it distinguishable from a real send.
export async function markOutboxDone(
	table: SkippableOutboxTable,
	where: SQL,
	{ now, skippedReason = null }: { now: Date; skippedReason?: string | null },
	tx: DbOrTx = db,
): Promise<void> {
	await tx.update(table).set({ sentAt: now, skippedReason }).where(where)
}

// Left unsent on purpose, so the next run picks it up again - until attempts
// reaches the cap and the claim stops selecting it. The attempt itself was
// already spent by the claim, so this only records why.
export async function markOutboxFailed(
	table: OutboxTable,
	where: SQL,
	error: string,
	tx: DbOrTx = db,
): Promise<void> {
	await tx.update(table).set({ lastError: error }).where(where)
}

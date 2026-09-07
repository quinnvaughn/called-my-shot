import { createHash } from "node:crypto"
import { db } from "../db"

// Fleet-wide mutual exclusion for the background jobs.
//
// startScheduler runs on every machine (it's called at the bottom of
// index.ts) and Fly runs more than one, so without this every job fires once
// per machine on the same tick. For the mail jobs that meant the same digest
// delivered twice to the same person.
//
// Deliberately the ONLY thing providing that exclusion. The obvious
// alternative - having each drain "claim" its rows with an UPDATE before
// sending - does not actually work: the claim commits before the send, which
// releases its row locks while the rows are still `sent_at is null`, so the
// next run walks straight back in and claims them again. Making that airtight
// needs either a lease column on every outbox table or a transaction held
// open across an external HTTP call. One lock per job is smaller than both,
// and it covers the sync jobs at the same time.
//
// Session-level (pg_try_advisory_lock) rather than transaction-level, because
// these jobs run for as long as a batch of sends takes and holding a
// transaction open across all of it would pin a connection and a snapshot for
// minutes. That's also why it takes a dedicated client out of the pool: an
// advisory lock belongs to the connection that took it, and db.execute()
// would hand the unlock to whichever pooled connection happened to be free.
//
// try, not wait: a machine that loses the race skips this tick rather than
// queueing up to run the same job again a moment later. A machine that dies
// mid-job releases its lock when Postgres notices the connection is gone, so
// a crash costs one tick, not the job forever.
//
// The name is the identity of the lock, so every caller of a given job has to
// pass the same one - that includes the CLI scripts in apps/api/scripts,
// which is what stops a drain run by hand from racing a scheduler tick.
function lockKey(name: string): string {
	// Postgres keys advisory locks by a signed 64-bit integer. Hashing the
	// name gives a stable key per job that can't collide with another job by
	// accident the way a hand-picked number eventually would.
	const digest = createHash("sha256").update(name).digest("hex").slice(0, 16)
	return BigInt.asIntN(64, BigInt(`0x${digest}`)).toString()
}

export async function withAdvisoryLock(
	name: string,
	fn: () => Promise<void>,
): Promise<{ ran: boolean }> {
	const key = lockKey(name)
	const client = await db.$client.connect()
	try {
		const { rows } = await client.query<{ locked: boolean }>(
			"select pg_try_advisory_lock($1) as locked",
			[key],
		)
		if (!rows[0]?.locked) return { ran: false }
		try {
			await fn()
		} finally {
			await client.query("select pg_advisory_unlock($1)", [key])
		}
		return { ran: true }
	} finally {
		client.release()
	}
}

// The lock names the jobs share with their schedulers. Constants rather than
// string literals at each call site because a typo in one of them silently
// buys a second, useless lock instead of failing.
export const DRAIN_DIGESTS_LOCK = "drain-email-digests"
export const DRAIN_SEASON_START_LOCK = "drain-season-start-emails"

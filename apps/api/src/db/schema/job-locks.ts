import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

// Fleet-wide mutual exclusion for the scheduled jobs, as a row rather than a
// Postgres advisory lock.
//
// Advisory locks were the obvious choice and are wrong here: DATABASE_URL
// points at Neon's POOLED endpoint, which is PgBouncer in transaction pooling
// mode. A session-level pg_try_advisory_lock takes the lock on whichever
// backend serves that one statement, and the matching pg_advisory_unlock runs
// on a different backend, so it unlocks nothing. Every lock leaks on first
// use and every later attempt fails forever - which is exactly what happened:
// one deploy took out sync-live-scores, lock-overdue-questions,
// sync-sports-data and both mail drains at once, silently, for hours.
//
// The transaction-scoped variant (pg_advisory_xact_lock) does survive
// pooling, but only by holding a transaction open for the whole job. For the
// mail drains that means an open transaction across every Resend call, and a
// rollback after a successful send would clear sent_at and mail the same
// person again on retry - trading a duplicate-send bug for a worse one.
//
// A lease row has neither problem: acquiring is one atomic INSERT ... ON
// CONFLICT, nothing is held open between statements, and a holder that dies
// is recovered by lockedUntil expiring rather than by anyone noticing.
export const jobLocks = pgTable("job_locks", {
	// The job's name, which is also its scheduler name and what the CLI
	// scripts pass to take the same lock - see lib/job-lock.ts.
	name: text("name").primaryKey(),
	// Refreshed on a heartbeat while the job runs, so the lease can be short
	// (a crashed holder blocks for at most this long) without having to guess
	// how long the slowest job takes.
	lockedUntil: timestamp("locked_until").notNull(),
	// Which process holds it. Release and refresh both match on this, so a
	// holder whose lease expired can't later delete a lease someone else has
	// since taken.
	holder: text("holder").notNull(),
})
export type JobLock = typeof jobLocks.$inferSelect

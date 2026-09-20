import { randomUUID } from "node:crypto"
import { hostname } from "node:os"
import { sql } from "drizzle-orm"
import { db } from "../db"

// How long a lease is good for without a refresh. Short, because this is also
// how long a job stays blocked after the machine holding it dies.
const LEASE_SECONDS = 300
// Refreshed well inside the lease so a slow job keeps it - three chances to
// land before it lapses. This is what lets LEASE_SECONDS stay short without
// anyone having to know how long the longest job runs.
const REFRESH_MS = 100_000

// Identifies this specific run, not just this machine: two runs in one
// process must not be able to release each other's lease.
function newHolder(): string {
	return `${hostname()}:${process.pid}:${randomUUID()}`
}

// One statement, so it is atomic under transaction pooling. The ON CONFLICT
// branch is what reclaims an expired lease; its WHERE means a live lease
// updates nothing and returns no row, which is the "someone else has it"
// signal. See db/schema/job-locks.ts for why this is a row and not
// pg_try_advisory_lock.
async function acquire(name: string, holder: string): Promise<boolean> {
	const { rows } = await db.execute<{ holder: string }>(sql`
		insert into job_locks (name, locked_until, holder)
		values (${name}, now() + ${`${LEASE_SECONDS} seconds`}::interval, ${holder})
		on conflict (name) do update
			set locked_until = excluded.locked_until, holder = excluded.holder
			where job_locks.locked_until < now()
		returning holder
	`)
	return rows.length > 0
}

async function refresh(name: string, holder: string): Promise<void> {
	await db.execute(sql`
		update job_locks
		set locked_until = now() + ${`${LEASE_SECONDS} seconds`}::interval
		where name = ${name} and holder = ${holder}
	`)
}

async function release(name: string, holder: string): Promise<void> {
	await db.execute(sql`
		delete from job_locks where name = ${name} and holder = ${holder}
	`)
}

// Runs `fn` only if this process can take the named lease, so a tick firing on
// every machine at once still runs the job once across the fleet.
// startScheduler runs on every machine (see index.ts) and Fly runs more than
// one; without this the mail drains delivered the same digest twice to the
// same person.
//
// try, not wait: a machine that loses skips this tick rather than queueing up
// to run the same job again moments later.
//
// The name is the lease's identity, so every caller of a job has to pass the
// same one - including the CLI scripts in apps/api/scripts, which is what
// stops a drain run by hand from racing a scheduler tick.
export async function withJobLock(
	name: string,
	fn: () => Promise<void>,
): Promise<{ ran: boolean }> {
	const holder = newHolder()
	if (!(await acquire(name, holder))) return { ran: false }

	const heartbeat = setInterval(() => {
		refresh(name, holder).catch((err) => {
			// Not fatal on its own - the lease still has time left, and there
			// are further attempts before it lapses.
			console.error(`[job-lock] refresh failed for ${name}:`, err)
		})
	}, REFRESH_MS)
	// Never let the heartbeat hold the event loop open: the CLI scripts run
	// this and then expect the process to exit.
	heartbeat.unref()

	try {
		await fn()
	} finally {
		clearInterval(heartbeat)
		// Best-effort. A release that fails leaves the lease to expire on its
		// own, which costs one tick, and must not mask the job's own error.
		await release(name, holder).catch((err) => {
			console.error(`[job-lock] release failed for ${name}:`, err)
		})
	}
	return { ran: true }
}

// The lease names the jobs share with their schedulers. Constants rather than
// string literals at each call site because a typo in one of them silently
// buys a second, useless lease instead of failing.
export const AUTO_RESOLVE_GAMES_LOCK = "auto-resolve-games"
// Held by the box score backfill and by the went-final sweep, so a hand-run
// backfill and a tick can't both be fetching the same games. Deliberately not
// AUTO_RESOLVE_GAMES_LOCK: a backfill can run for the better part of an hour,
// and blocking resolution for that long would cost callers their results.
// Overlap on one individual game is handled by persistBoxScore's own
// SELECT ... FOR UPDATE.
export const BOX_SCORE_SYNC_LOCK = "sync-box-scores"
export const DRAIN_ANALYTICS_LOCK = "drain-analytics-outbox"
export const DRAIN_DIGESTS_LOCK = "drain-email-digests"
export const DRAIN_GAME_REMINDERS_LOCK = "drain-game-reminders"
export const DRAIN_SEASON_START_LOCK = "drain-season-start-emails"
export const RECOMPUTE_ACHIEVEMENTS_LOCK = "recompute-achievements"

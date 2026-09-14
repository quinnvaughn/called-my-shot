import { and, asc, eq } from "drizzle-orm"
import { db } from "../../db"
import { streakRecomputeQueue, sweepRecomputeQueue } from "../../db/schema"
import { recomputeSlate, recomputeStreakTrack } from "./recompute"

const BATCH_SIZE = 200
// A cap on rebuilds per run, so one run can't hold the lease indefinitely.
// Anything past it is still queued for the next tick.
const MAX_PER_RUN = 5000

// Rebuilds everything lib/streaks/enqueue.ts marked. Each rebuild is its own
// short transaction, and its queue row is deleted in that transaction only if
// it still carries the dirtiedAt this run read - a question settling mid-
// rebuild re-marks the row, so it survives for the next pass instead of being
// lost.
//
// MUST be called under RECOMPUTE_ACHIEVEMENTS_LOCK (lib/job-lock.ts): two
// concurrent rebuilds of one track could each read the other's half-written
// "before" and announce the same event from both sides of it.
export async function drainAchievementRecomputes({
	notify = true,
	now = new Date(),
}: {
	notify?: boolean
	now?: Date
} = {}): Promise<{ tracks: number; slates: number }> {
	const opts = { notify, now }

	// A row this run already rebuilt that's still at the head of the queue
	// wasn't deleted - re-marked mid-rebuild. It waits for the next run rather
	// than looping here.
	const seen = new Set<string>()
	let tracks = 0
	while (tracks < MAX_PER_RUN) {
		const batch = await db
			.select()
			.from(streakRecomputeQueue)
			.orderBy(asc(streakRecomputeQueue.dirtiedAt))
			.limit(BATCH_SIZE)
		const fresh = batch.filter(
			(row) =>
				!seen.has(
					`${row.userId}:${row.leagueId}:${row.family}:${row.dirtiedAt.getTime()}`,
				),
		)
		if (fresh.length === 0) break
		for (const row of fresh) {
			seen.add(
				`${row.userId}:${row.leagueId}:${row.family}:${row.dirtiedAt.getTime()}`,
			)
			await db.transaction(async (tx) => {
				await recomputeStreakTrack(
					tx,
					row.userId,
					row.leagueId,
					row.family,
					opts,
				)
				await tx
					.delete(streakRecomputeQueue)
					.where(
						and(
							eq(streakRecomputeQueue.userId, row.userId),
							eq(streakRecomputeQueue.leagueId, row.leagueId),
							eq(streakRecomputeQueue.family, row.family),
							eq(streakRecomputeQueue.dirtiedAt, row.dirtiedAt),
						),
					)
			})
			tracks++
		}
	}

	let slates = 0
	while (slates < MAX_PER_RUN) {
		const batch = await db
			.select()
			.from(sweepRecomputeQueue)
			.orderBy(asc(sweepRecomputeQueue.dirtiedAt))
			.limit(BATCH_SIZE)
		const fresh = batch.filter(
			(row) =>
				!seen.has(`${row.leagueId}:${row.slateKey}:${row.dirtiedAt.getTime()}`),
		)
		if (fresh.length === 0) break
		for (const row of fresh) {
			seen.add(`${row.leagueId}:${row.slateKey}:${row.dirtiedAt.getTime()}`)
			await db.transaction(async (tx) => {
				await recomputeSlate(tx, row.leagueId, row.slateKey, opts)
				await tx
					.delete(sweepRecomputeQueue)
					.where(
						and(
							eq(sweepRecomputeQueue.leagueId, row.leagueId),
							eq(sweepRecomputeQueue.slateKey, row.slateKey),
							eq(sweepRecomputeQueue.dirtiedAt, row.dirtiedAt),
						),
					)
			})
			slates++
		}
	}

	if (tracks > 0 || slates > 0) {
		console.log(`[streaks] rebuilt tracks=${tracks} slates=${slates}`)
	}
	return { tracks, slates }
}

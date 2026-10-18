import { and, asc, eq } from "drizzle-orm"
import { db } from "../../db"
import { chainRecomputeQueue } from "../../db/schema"
import { RECOMPUTE_CHAINS_LOCK, withJobLock } from "../job-lock"
import { recomputeChain } from "./recompute"

const BATCH_SIZE = 200
// A cap on rebuilds per run, so one run can't hold the lease indefinitely.
const MAX_PER_RUN = 5000

// Rebuilds every chain lib/chains/enqueue.ts marked, each in its own short
// transaction, deleting the queue row only if it still carries the
// dirtiedAt this run read - the same guard as the streak drain, so a link
// settling mid-rebuild isn't lost.
//
// MUST be called under RECOMPUTE_CHAINS_LOCK (lib/job-lock.ts): two rebuilds
// of one chain at once could both see it newly settled and announce it twice.
export async function drainChainRecomputes({
	notify = true,
}: {
	notify?: boolean
} = {}): Promise<{ chains: number }> {
	const seen = new Set<string>()
	let rebuilt = 0
	while (rebuilt < MAX_PER_RUN) {
		const batch = await db
			.select()
			.from(chainRecomputeQueue)
			.orderBy(asc(chainRecomputeQueue.dirtiedAt))
			.limit(BATCH_SIZE)
		const fresh = batch.filter(
			(row) => !seen.has(`${row.chainId}:${row.dirtiedAt.getTime()}`),
		)
		if (fresh.length === 0) break
		for (const row of fresh) {
			seen.add(`${row.chainId}:${row.dirtiedAt.getTime()}`)
			await db.transaction(async (tx) => {
				await recomputeChain(tx, row.chainId, { notify })
				await tx
					.delete(chainRecomputeQueue)
					.where(
						and(
							eq(chainRecomputeQueue.chainId, row.chainId),
							eq(chainRecomputeQueue.dirtiedAt, row.dirtiedAt),
						),
					)
			})
			rebuilt++
		}
	}
	if (rebuilt > 0) console.log(`[chains] rebuilt chains=${rebuilt}`)
	return { chains: rebuilt }
}

// For a settle outside the game-window ticks (an admin's resolve, void or
// overturn): rebuilds now instead of leaving the chain's result for the next
// tick. Skips quietly when a drain is already running, which picks the mark
// up anyway.
export async function drainChainsNow(): Promise<void> {
	try {
		await withJobLock(RECOMPUTE_CHAINS_LOCK, async () => {
			await drainChainRecomputes()
		})
	} catch (err) {
		console.error("[chains] drain after settle failed:", err)
	}
}

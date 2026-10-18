import type { Question } from "../../db/schema"
import { chainRecomputeQueue } from "../../db/schema"
import type { Tx } from "../../db/types"
import { chainIdsForQuestion } from "./load"

// Marks every chain this question is a link in as needing a rebuild. Called
// inside the transaction that settles, voids or deletes the question - before
// a hard delete, while the links that name the chains still exist - and
// lib/chains/drain.ts does the rebuild afterwards, outside it.
export async function markChainsDirty(tx: Tx, question: Pick<Question, "id">) {
	const chainIds = await chainIdsForQuestion(tx, question.id)
	if (chainIds.length === 0) return
	// Set here rather than by the column default, for the same reason as
	// markAchievementsDirty: the drain compares it for equality.
	const dirtiedAt = new Date()
	await tx
		.insert(chainRecomputeQueue)
		.values(chainIds.map((chainId) => ({ chainId, dirtiedAt })))
		.onConflictDoUpdate({
			target: chainRecomputeQueue.chainId,
			set: { dirtiedAt },
		})
}

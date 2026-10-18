import type { Question } from "../db/schema"
import type { Tx } from "../db/types"
import { markChainsDirty } from "./chains/enqueue"
import { markPresserDue } from "./pressers/enqueue"
import { markAchievementsDirty } from "./streaks/enqueue"

// The work a question settling, being voided or being deleted leaves for the
// drains: streaks, sweeps and chains to rebuild, and pressers that may now be
// due.
// Runs in the transaction making the change, and before a hard delete.
export async function markSettleFollowups(
	tx: Tx,
	question: Question,
): Promise<void> {
	await markAchievementsDirty(tx, question)
	await markChainsDirty(tx, question)
	await markPresserDue(tx, question)
}

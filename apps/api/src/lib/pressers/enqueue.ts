import { eq } from "drizzle-orm"
import { calls, presserOpenQueue, type Question } from "../../db/schema"
import type { Tx } from "../../db/types"

// Marks every caller on a game question as maybe due a presser on that game.
// Called inside the transaction that settles, voids or deletes the question,
// the same as markAchievementsDirty and for the same reason: the mark commits
// with the change. Must run before a hard delete, while the calls still say
// who to check.
export async function markPresserDue(
	tx: Tx,
	question: Pick<Question, "id" | "gameId">,
): Promise<void> {
	if (!question.gameId) return
	const dirtiedAt = new Date()
	const callers = await tx
		.selectDistinct({ userId: calls.userId })
		.from(calls)
		.where(eq(calls.questionId, question.id))
	if (callers.length === 0) return
	await tx
		.insert(presserOpenQueue)
		.values(
			callers.map(({ userId }) => ({
				userId,
				gameId: question.gameId as string,
				dirtiedAt,
			})),
		)
		.onConflictDoUpdate({
			target: [presserOpenQueue.userId, presserOpenQueue.gameId],
			set: { dirtiedAt },
		})
}

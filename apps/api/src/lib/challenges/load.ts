import { asc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { challengeQuestions, questions } from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import type { ChallengeQuestionFacts } from "./outcome"

// The questions in each challenge, in the creator's order, with just what
// the challenge's state is read from.
export async function loadChallengeQuestionFacts(
	challengeIds: string[],
	executor: DbOrTx = db,
): Promise<Map<string, ChallengeQuestionFacts[]>> {
	const byChallengeId = new Map<string, ChallengeQuestionFacts[]>(
		challengeIds.map((id) => [id, []]),
	)
	if (challengeIds.length === 0) return byChallengeId
	const rows = await executor
		.select({
			challengeId: challengeQuestions.challengeId,
			id: questions.id,
			status: questions.status,
			locksAt: questions.locksAt,
			resolvedAt: questions.resolvedAt,
		})
		.from(challengeQuestions)
		.innerJoin(questions, eq(questions.id, challengeQuestions.questionId))
		.where(inArray(challengeQuestions.challengeId, challengeIds))
		.orderBy(asc(challengeQuestions.position))
	for (const { challengeId, ...facts } of rows) {
		byChallengeId.get(challengeId)?.push(facts)
	}
	return byChallengeId
}

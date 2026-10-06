import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { ballotQuestions, ballotTiebreaks } from "../db/schema"

// One user's stored tiebreak positions on a ballot, keyed by questionId. Only
// rows for questions still on the ballot come back, so a member that was
// removed (and maybe placed on another ballot) carries nothing over.
export async function loadTiebreakPositions(
	userId: string,
	questionIds: readonly string[],
): Promise<Map<string, number>> {
	if (questionIds.length === 0) return new Map()
	const rows = await db
		.select({
			questionId: ballotTiebreaks.questionId,
			position: ballotTiebreaks.position,
		})
		.from(ballotTiebreaks)
		.innerJoin(
			ballotQuestions,
			and(
				eq(ballotQuestions.ballotId, ballotTiebreaks.ballotId),
				eq(ballotQuestions.questionId, ballotTiebreaks.questionId),
			),
		)
		.where(
			and(
				eq(ballotTiebreaks.userId, userId),
				inArray(ballotTiebreaks.questionId, [...questionIds]),
			),
		)
	return new Map(rows.map((r) => [r.questionId, r.position]))
}

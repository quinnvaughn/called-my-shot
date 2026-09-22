import { db } from "../db"
import type { BallotQuestion } from "../db/schema"
import { loadPickEntry, type PickEntry } from "./pick-entry"

// One user's filled-out ballot. A ballot pick is an ordinary call on one of
// the ballot's member questions (see pick-entry.ts).
export type BallotEntry = PickEntry<BallotQuestion>

export async function loadBallotEntry(
	ballotId: string,
	userId: string,
): Promise<BallotEntry | null> {
	const memberRows = await db.query.ballotQuestions.findMany({
		where: { ballotId },
		orderBy: { sortOrder: "asc" },
		with: { question: { columns: { id: true, status: true } } },
	})
	return loadPickEntry(
		userId,
		// Handed to BallotQuestionRef as bare rows, for the same reason as the
		// calls in pick-entry.ts.
		memberRows.map(({ question, ...member }) => ({
			member,
			questionId: member.questionId,
			status: question?.status,
		})),
	)
}

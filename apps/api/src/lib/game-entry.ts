import { db } from "../db"
import type { Question } from "../db/schema"
import { loadPickEntry, type PickEntry } from "./pick-entry"

// One user's calls on a game's official questions. Community questions are
// left out, same as Game.officialQuestions: a game can collect any number of
// them.
export type GameEntry = PickEntry<Question>

export async function loadGameEntry(
	gameId: string,
	userId: string,
): Promise<GameEntry | null> {
	const questionRows = await db.query.questions.findMany({
		where: { gameId, isOfficial: true },
		orderBy: { createdAt: "asc", id: "asc" },
	})
	return loadPickEntry(
		userId,
		questionRows.map((question) => ({
			member: question,
			questionId: question.id,
			status: question.status,
		})),
	)
}

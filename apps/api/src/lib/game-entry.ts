import { db } from "../db"
import type { Call, Game, Question } from "../db/schema"
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

// The fewest settled calls a game has to hold before going all one way means
// anything. Below it, 3-0 or 0-3 is a handful of picks, not a night.
export const GAME_ENTRY_VERDICT_MIN_CALLS = 5

// A finished game called entirely right or entirely wrong. Cosmetic: it pays
// and costs nothing, the points already did that.
export type GameEntryVerdict = "perfect" | "oh_fer"

// Null until the game is final and every counted call has a result. Before
// then a clean record isn't finished: a call still waiting on a result could
// land either way, and the entry could still take more calls. Voided and
// unscored calls count on neither side, the same as the record itself.
export function gameEntryVerdict(
	entry: {
		members: {
			member: Pick<Question, "status">
			call: Pick<Call, "unscoredReason"> | null
		}[]
		wins: number
		losses: number
	},
	gameStatus: Game["status"],
): GameEntryVerdict | null {
	if (gameStatus !== "final") return null
	const awaitingResult = entry.members.some(
		({ member, call }) =>
			call !== null &&
			call.unscoredReason === null &&
			(member.status === "open" || member.status === "locked"),
	)
	if (awaitingResult) return null
	if (entry.wins + entry.losses < GAME_ENTRY_VERDICT_MIN_CALLS) return null
	if (entry.losses === 0) return "perfect"
	if (entry.wins === 0) return "oh_fer"
	return null
}

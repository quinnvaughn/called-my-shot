import { and, asc, eq, getTableColumns } from "drizzle-orm"
import { db } from "../db"
import {
	type Call,
	calls,
	type Game,
	type Question,
	questions,
} from "../db/schema"
import { loadPickEntry, type PickEntry } from "./pick-entry"

// One user's calls on a game, behind /games/:id/picks/:username. Split in
// two because the halves are different kinds of set: the official questions
// are the same slate for everyone, so every one of them is a member (called
// or not) and only they decide a Perfect card or an Oh-fer. Community
// questions are whatever anyone posted, so only the ones this user called
// are members. The top-level record and points cover both, which is what the
// report card's best and worst game count too.
export type GameEntry = {
	official: PickEntry<Question>
	community: PickEntry<Question>
	wins: number
	losses: number
	points: number
}

// Null when the user has no calls on any of the game's questions, so an entry
// page never renders for someone who hasn't called anything on it.
export async function loadGameEntry(
	gameId: string,
	userId: string,
): Promise<GameEntry | null> {
	const [officialRows, communityRows] = await Promise.all([
		db.query.questions.findMany({
			where: { gameId, isOfficial: true },
			orderBy: { createdAt: "asc", id: "asc" },
		}),
		db
			.select(getTableColumns(questions))
			.from(questions)
			.innerJoin(calls, eq(calls.questionId, questions.id))
			.where(
				and(
					eq(questions.gameId, gameId),
					eq(questions.isOfficial, false),
					eq(calls.userId, userId),
				),
			)
			.orderBy(asc(questions.createdAt), asc(questions.id)),
	])
	const asMembers = (rows: Question[]) =>
		rows.map((question) => ({
			member: question,
			questionId: question.id,
			status: question.status,
		}))
	const [official, community] = await Promise.all([
		loadPickEntry(userId, asMembers(officialRows)),
		loadPickEntry(userId, asMembers(communityRows)),
	])
	if (!official && !community) return null

	const officialEntry = official ?? uncalledEntry(officialRows)
	const communityEntry = community ?? uncalledEntry([])
	return {
		official: officialEntry,
		community: communityEntry,
		wins: officialEntry.wins + communityEntry.wins,
		losses: officialEntry.losses + communityEntry.losses,
		points: officialEntry.points + communityEntry.points,
	}
}

// The official slate of someone whose calls on this game are all community
// ones: every question still listed, so the page can say what's left.
function uncalledEntry(rows: Question[]): PickEntry<Question> {
	return {
		members: rows.map((member) => ({ member, call: null })),
		calledCount: 0,
		wins: 0,
		losses: 0,
		points: 0,
	}
}

// The fewest settled calls a game has to hold before going all one way means
// anything. Below it, 3-0 or 0-3 is a handful of picks, not a night.
export const GAME_ENTRY_VERDICT_MIN_CALLS = 5

// A finished game called entirely right or entirely wrong. Cosmetic: it pays
// and costs nothing, the points already did that.
export type GameEntryVerdict = "perfect" | "oh_fer"

// Official questions only - see GameEntry. Null until the game is final and
// every counted call has a result. Before
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

import {
	and,
	countDistinct,
	desc,
	eq,
	gte,
	inArray,
	lte,
	or,
} from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../db"
import {
	type Call,
	calls,
	type Game,
	games,
	groupMembers,
	questions,
} from "../db/schema"
import { tallyCalls } from "./pick-entry"

// One member's night on a game, for the group game board. Same record and
// points as their /games/:id/picks/:username page (both go through
// tallyCalls), plus the calls still waiting on a result so the board can say
// what's still live.
export type GroupGameEntry = {
	userId: string
	calledCount: number
	wins: number
	losses: number
	points: number
	openCalls: Call[]
}

// Every member with at least one call on the game, the viewer included.
// Official and community questions both count, the same as the picks page's
// top-level record.
export async function loadGroupGameEntries(
	gameId: string,
	memberIds: string[],
): Promise<GroupGameEntry[]> {
	if (memberIds.length === 0) return []
	const rows = await db.query.calls.findMany({
		where: { userId: { in: memberIds }, question: { gameId } },
		with: {
			question: { columns: { status: true } },
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})

	const byUser = new Map<string, typeof rows>()
	for (const row of rows) {
		const list = byUser.get(row.userId)
		if (list) list.push(row)
		else byUser.set(row.userId, [row])
	}

	return [...byUser].map(([userId, userRows]) => ({
		userId,
		calledCount: userRows.length,
		...tallyCalls(
			userRows.map((row) => ({ call: row, status: row.question?.status })),
		),
		// Bare rows, for the same reason as loadPickEntry: CallRef reads a
		// partially loaded relation as the whole relation.
		openCalls: userRows
			.filter(
				(row) =>
					row.unscoredReason === null &&
					(row.question?.status === "open" ||
						row.question?.status === "locked"),
			)
			.map(({ question: _question, selections: _selections, ...call }) => call),
	}))
}

// How far either side of now the group page's games strip reaches: games
// about to start, games on now, and games that just ended so the night's
// results are still a tap away the next morning.
export const GROUP_GAMES_UPCOMING_MS = 24 * 60 * 60 * 1000
export const GROUP_GAMES_RECENT_FINAL_MS = 12 * 60 * 60 * 1000
// A scheduled game whose start has passed but the score sync hasn't flipped
// to live yet is still on, not gone.
const GROUP_GAMES_LATE_START_MS = 6 * 60 * 60 * 1000
// No real game runs this long. A game still marked live past it is a record
// the score sync stopped checking (it only looks back six hours), not a game
// in progress.
export const GROUP_GAMES_MAX_LIVE_MS = 12 * 60 * 60 * 1000

export type GroupGame = { game: Game; callerCount: number }

// Games in the strip's window that at least one member has called, live
// first, then upcoming soonest first, then finals most recent first.
// tracked narrows to the group's leagues; null means every league.
export async function loadGroupGames(
	memberIds: string[],
	tracked: string[] | null,
	now: Date = new Date(),
): Promise<GroupGame[]> {
	if (memberIds.length === 0) return []
	const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

	const counts = await db
		.select({ gameId: games.id, callerCount: countDistinct(calls.userId) })
		.from(games)
		.innerJoin(questions, eq(questions.gameId, games.id))
		.innerJoin(calls, eq(calls.questionId, questions.id))
		.where(
			and(
				inArray(calls.userId, memberIds),
				tracked ? inArray(games.leagueId, tracked) : undefined,
				or(
					and(
						eq(games.status, "live"),
						gte(games.startsAt, at(-GROUP_GAMES_MAX_LIVE_MS)),
					),
					and(
						eq(games.status, "scheduled"),
						gte(games.startsAt, at(-GROUP_GAMES_LATE_START_MS)),
						lte(games.startsAt, at(GROUP_GAMES_UPCOMING_MS)),
					),
					and(
						eq(games.status, "final"),
						gte(games.finalizedAt, at(-GROUP_GAMES_RECENT_FINAL_MS)),
					),
				),
			),
		)
		.groupBy(games.id)
	if (counts.length === 0) return []

	const gameRows = await db.query.games.findMany({
		where: { id: { in: counts.map((c) => c.gameId) } },
	})
	const callerCount = new Map(counts.map((c) => [c.gameId, c.callerCount]))
	const rank = (game: Game) =>
		match(game.status)
			.with("live", () => 0)
			.with("scheduled", () => 1)
			.with("final", () => 2)
			.exhaustive()

	return gameRows
		.sort((a, b) => {
			const byStatus = rank(a) - rank(b)
			if (byStatus !== 0) return byStatus
			if (a.status === "final") {
				return (b.finalizedAt?.getTime() ?? 0) - (a.finalizedAt?.getTime() ?? 0)
			}
			return a.startsAt.getTime() - b.startsAt.getTime()
		})
		.map((game) => ({ game, callerCount: callerCount.get(game.id) ?? 0 }))
}

// The viewer's groups where at least one member, the viewer included, has
// called this game, most callers first. What the game page links to the
// group boards from.
export async function loadViewerGroupsOnGame(
	viewerId: string,
	gameId: string,
): Promise<{ groupId: string; callerCount: number }[]> {
	const viewerGroups = db
		.select({ groupId: groupMembers.groupId })
		.from(groupMembers)
		.where(eq(groupMembers.userId, viewerId))

	const callerCount = countDistinct(calls.userId)
	return db
		.select({ groupId: groupMembers.groupId, callerCount })
		.from(groupMembers)
		.innerJoin(calls, eq(calls.userId, groupMembers.userId))
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.where(
			and(
				inArray(groupMembers.groupId, viewerGroups),
				eq(questions.gameId, gameId),
			),
		)
		.groupBy(groupMembers.groupId)
		.orderBy(desc(callerCount))
}

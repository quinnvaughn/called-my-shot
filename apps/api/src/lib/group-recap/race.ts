import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"
import { db } from "../../db"
import { calls, type Game, games, questions } from "../../db/schema"
import type { GroupLeaderboardEntry } from "../group-leaderboard"
import type { RecapWeek } from "./week"

// The group rail's Player of the Week race: the top of the week board, the
// viewer's own row and the member they're chasing, and how many calls each
// still has riding on the week.

export type WeekRaceEntry = GroupLeaderboardEntry & { openCallCount: number }

export type WeekRace = {
	week: RecapWeek
	leaders: WeekRaceEntry[]
	viewer: WeekRaceEntry | null
	// The member ranked just above the viewer, or just below when the viewer
	// leads. Null while the viewer is unranked or alone on the board.
	viewerNeighbor: WeekRaceEntry | null
	// The earliest-starting game an open call rides on that hasn't gone
	// final: in play now, or the next one up.
	nextGame: Game | null
}

export const WEEK_RACE_LEADERS = 3

export type OpenWeekCalls = {
	countByUser: Map<string, number>
	nextGame: Game | null
}

// Calls still to settle that will count toward `week` when they do. A game
// call lands in the week its game goes final (see realizedAt in ./load.ts),
// so that's a game not final yet that starts before the week ends, or one
// that went final inside it and is waiting on its result. A question with no
// game lands whenever it resolves, which can't be known ahead, so none count.
export async function loadOpenWeekCalls(
	memberIds: string[],
	leagueIds: string[] | null,
	week: RecapWeek,
): Promise<OpenWeekCalls> {
	if (memberIds.length === 0) return { countByUser: new Map(), nextGame: null }
	const rows = await db
		.select({ userId: calls.userId, game: games })
		.from(calls)
		.innerJoin(questions, eq(questions.id, calls.questionId))
		.innerJoin(games, eq(games.id, questions.gameId))
		.where(
			and(
				inArray(calls.userId, memberIds),
				isNull(calls.unscoredReason),
				inArray(questions.status, ["open", "locked"]),
				leagueIds ? inArray(questions.leagueId, leagueIds) : undefined,
				or(
					and(
						inArray(games.status, ["scheduled", "live"]),
						lt(games.startsAt, week.end),
					),
					and(
						gte(games.finalizedAt, week.start),
						lt(games.finalizedAt, week.end),
					),
				),
			),
		)
		.orderBy(asc(games.startsAt))

	const countByUser = new Map<string, number>()
	for (const row of rows) {
		countByUser.set(row.userId, (countByUser.get(row.userId) ?? 0) + 1)
	}
	return {
		countByUser,
		nextGame: rows.find((row) => row.game.status !== "final")?.game ?? null,
	}
}

export function buildWeekRace(
	board: GroupLeaderboardEntry[],
	open: OpenWeekCalls,
	viewerId: string | null,
	week: RecapWeek,
): WeekRace {
	const entries = board.map((entry) => ({
		...entry,
		openCallCount: open.countByUser.get(entry.user.id) ?? 0,
	}))
	const ranked = entries.filter((entry) => entry.rank !== null)
	const viewer = entries.find((entry) => entry.user.id === viewerId) ?? null
	const viewerIndex = viewer ? ranked.indexOf(viewer) : -1
	const neighborIndex =
		viewerIndex === -1 ? -1 : viewerIndex === 0 ? 1 : viewerIndex - 1

	return {
		week,
		leaders: ranked.slice(0, WEEK_RACE_LEADERS),
		viewer,
		viewerNeighbor: ranked[neighborIndex] ?? null,
		nextGame: open.nextGame,
	}
}

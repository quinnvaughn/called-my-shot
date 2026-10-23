import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm"
import { db } from "../../db"
import {
	type RankPuzzle,
	rankPuzzleResults,
	rankPuzzles,
	type Team,
	teams,
} from "../../db/schema"
import {
	evaluateRankPlacements,
	type RankPlayState,
	rankSquaresCode,
} from "./play"
import type { FinishedRankGame } from "./stats"

export function findRankPuzzleForDay(day: string) {
	return db.query.rankPuzzles
		.findFirst({ where: { playDate: day } })
		.then((p) => p ?? null)
}

export function findRankPuzzle(id: string) {
	return db.query.rankPuzzles
		.findFirst({ where: { id } })
		.then((p) => p ?? null)
}

// A game's state with the teams its items show, so the GraphQL layer can
// hand back logos without a lookup per item.
export type RankPlayView = {
	puzzle: RankPuzzle
	state: RankPlayState
	teamsById: Map<string, Team>
}

export async function loadRankTeams(
	puzzle: RankPuzzle,
): Promise<Map<string, Team>> {
	const ids = [
		...new Set(puzzle.items.flatMap((i) => (i.teamId ? [i.teamId] : []))),
	]
	if (ids.length === 0) return new Map()
	const rows = await db.select().from(teams).where(inArray(teams.id, ids))
	return new Map(rows.map((t) => [t.id, t]))
}

export async function loadRankPlayView(
	puzzle: RankPuzzle,
	placements: readonly number[],
): Promise<RankPlayView> {
	return {
		puzzle,
		state: evaluateRankPlacements(puzzle.items, placements),
		teamsById: await loadRankTeams(puzzle),
	}
}

// Every finished game a player has, for their stats.
export async function loadFinishedRankGames(
	userId: string,
): Promise<FinishedRankGame[]> {
	const rows = await db
		.select({
			day: rankPuzzles.playDate,
			items: rankPuzzles.items,
			placements: rankPuzzleResults.placements,
		})
		.from(rankPuzzleResults)
		.innerJoin(rankPuzzles, eq(rankPuzzles.id, rankPuzzleResults.puzzleId))
		.where(
			and(
				eq(rankPuzzleResults.userId, userId),
				isNotNull(rankPuzzleResults.finishedAt),
			),
		)
	return rows.map((row) => ({
		day: row.day,
		correctCount:
			evaluateRankPlacements(row.items, row.placements).correctCount ?? 0,
	}))
}

// The puzzles that ran between two days, inclusive, with every result on
// them from `userIds`.
export async function loadRankResultsBetween(
	fromDay: string,
	toDay: string,
	userIds: string[],
) {
	if (userIds.length === 0) return []
	return db
		.select({
			day: rankPuzzles.playDate,
			items: rankPuzzles.items,
			userId: rankPuzzleResults.userId,
			placements: rankPuzzleResults.placements,
		})
		.from(rankPuzzleResults)
		.innerJoin(rankPuzzles, eq(rankPuzzles.id, rankPuzzleResults.puzzleId))
		.where(
			and(
				gte(rankPuzzles.playDate, fromDay),
				lte(rankPuzzles.playDate, toDay),
				inArray(rankPuzzleResults.userId, userIds),
			),
		)
}

// The player a shared link names (its ?by=), only when their own finished
// game on the puzzle has the link's squares.
export async function verifiedRankSharer(
	puzzle: RankPuzzle,
	username: string,
	squaresCode: string,
) {
	const user = await db.query.users.findFirst({ where: { username } })
	if (!user) return null
	const result = await db.query.rankPuzzleResults.findFirst({
		where: { puzzleId: puzzle.id, userId: user.id },
	})
	if (!result?.finishedAt) return null
	const state = evaluateRankPlacements(puzzle.items, result.placements)
	return rankSquaresCode(state) === squaresCode.toLowerCase() ? user : null
}

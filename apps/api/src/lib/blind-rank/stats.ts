import { arcadeStreaks } from "../arcade/streaks"
import { RANK_ITEM_COUNT } from "./generate"

// One finished game: the day it was for, and how many of the five it got in
// the right slot.
export type FinishedRankGame = { day: string; correctCount: number }

export type RankStats = {
	played: number
	// All five right.
	perfect: number
	// Index n is games with n right, 0 to 5.
	distribution: number[]
	currentStreak: number
	bestStreak: number
}

export function rankStats(games: FinishedRankGame[], today: string): RankStats {
	const distribution = Array<number>(RANK_ITEM_COUNT + 1).fill(0)
	for (const game of games) {
		distribution[game.correctCount] = (distribution[game.correctCount] ?? 0) + 1
	}
	return {
		played: games.length,
		perfect: distribution[RANK_ITEM_COUNT] ?? 0,
		distribution,
		...arcadeStreaks(
			games.map((g) => g.day),
			today,
		),
	}
}

import { arcadeStreaks } from "../arcade/streaks"
import { SEASON_PUZZLE_MAX_GUESSES } from "./play"

// One finished game: the day it was for, and how many guesses it took (null
// for a miss).
export type FinishedSeasonGame = { day: string; guessCount: number | null }

export type SeasonStats = {
	played: number
	solved: number
	// Index 0 is solved in 1, index 5 solved in 6.
	distribution: number[]
	missed: number
	// Consecutive days with a finished game, counting today if it's done,
	// otherwise up to yesterday: a streak isn't broken until a day passes
	// without a game.
	currentStreak: number
	bestStreak: number
}

export function seasonStats(
	games: FinishedSeasonGame[],
	today: string,
): SeasonStats {
	const distribution = Array(SEASON_PUZZLE_MAX_GUESSES).fill(0)
	let solved = 0
	for (const game of games) {
		if (game.guessCount === null) continue
		solved++
		distribution[game.guessCount - 1]++
	}

	const { currentStreak, bestStreak } = arcadeStreaks(
		games.map((g) => g.day),
		today,
	)

	return {
		played: games.length,
		solved,
		distribution,
		missed: games.length - solved,
		currentStreak,
		bestStreak,
	}
}

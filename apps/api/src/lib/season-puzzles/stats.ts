import { addSeasonPuzzleDays } from "./day"
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

	const days = [...new Set(games.map((g) => g.day))].sort()
	let bestStreak = 0
	let run = 0
	let previous: string | null = null
	for (const day of days) {
		run = previous && addSeasonPuzzleDays(previous, 1) === day ? run + 1 : 1
		bestStreak = Math.max(bestStreak, run)
		previous = day
	}

	const played = new Set(days)
	let currentStreak = 0
	let cursor = played.has(today) ? today : addSeasonPuzzleDays(today, -1)
	while (played.has(cursor)) {
		currentStreak++
		cursor = addSeasonPuzzleDays(cursor, -1)
	}

	return {
		played: games.length,
		solved,
		distribution,
		missed: games.length - solved,
		currentStreak,
		bestStreak,
	}
}

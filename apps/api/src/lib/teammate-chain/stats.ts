import { arcadeStreaks } from "../arcade/streaks"
import type { FinishedChainGame } from "./load"

export type ChainStats = {
	played: number
	solved: number
	// Solved in the fewest links any route needed.
	atPar: number
	// Links over par across solved games, on average. Null before a solve.
	averageOverPar: number | null
	// The fastest solve, in seconds. Null before a solve.
	bestSeconds: number | null
	// Consecutive days with a finished game, counting today if it's done,
	// otherwise up to yesterday.
	currentStreak: number
	bestStreak: number
}

export function chainStats(
	games: readonly FinishedChainGame[],
	today: string,
): ChainStats {
	const solved = games.filter((game) => game.links !== null)
	const overPar = solved.map((game) => (game.links as number) - game.par)
	const times = solved.flatMap((game) =>
		game.seconds === null ? [] : [game.seconds],
	)
	const { currentStreak, bestStreak } = arcadeStreaks(
		games.map((game) => game.day),
		today,
	)
	return {
		played: games.length,
		solved: solved.length,
		atPar: overPar.filter((over) => over <= 0).length,
		averageOverPar:
			overPar.length > 0
				? overPar.reduce((sum, over) => sum + over, 0) / overPar.length
				: null,
		bestSeconds: times.length > 0 ? Math.min(...times) : null,
		currentStreak,
		bestStreak,
	}
}

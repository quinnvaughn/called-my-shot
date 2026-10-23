import { addArcadeDays } from "./day"

// A player's arcade streaks from the days they finished a game.
// Current counts today if it's done, otherwise up to yesterday: a streak
// isn't broken until a whole day passes without a game.
export function arcadeStreaks(
	finishedDays: readonly string[],
	today: string,
): { currentStreak: number; bestStreak: number } {
	const days = [...new Set(finishedDays)].sort()
	let bestStreak = 0
	let run = 0
	let previous: string | null = null
	for (const day of days) {
		run = previous && addArcadeDays(previous, 1) === day ? run + 1 : 1
		bestStreak = Math.max(bestStreak, run)
		previous = day
	}

	const played = new Set(days)
	let currentStreak = 0
	let cursor = played.has(today) ? today : addArcadeDays(today, -1)
	while (played.has(cursor)) {
		currentStreak++
		cursor = addArcadeDays(cursor, -1)
	}
	return { currentStreak, bestStreak }
}

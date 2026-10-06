// A win-totals ballot hands out a fixed number of wins: every game has one
// winner, so a league's totals add up to gamesPerSeason × teams / 2. This is
// the running count of a user's picks against that number, shown while they
// pick so the total lands where a real season can.

export type WinTotalBudget = {
	leagueAbbreviation: string
	gamesPerSeason: number
	teamCount: number
	// The user's other picks on the ballot, not counting the one being made.
	otherPicksSum: number
	otherPicksCount: number
}

export function leagueWins(gamesPerSeason: number, teamCount: number): number {
	return (gamesPerSeason * teamCount) / 2
}

function wins(n: number): string {
	return `${n} ${Math.abs(n) === 1 ? "win" : "wins"}`
}

function teams(n: number): string {
	return `${n} ${n === 1 ? "team" : "teams"}`
}

// The tracker line for a pick of `guess`. `off` marks a total the schedule
// can't produce: already past it with teams still to pick, or finished
// somewhere other than exactly on it.
export function winTotalTrackerLine(
	budget: WinTotalBudget,
	guess: number,
): { text: string; off: boolean } {
	const target = leagueWins(budget.gamesPerSeason, budget.teamCount)
	const total = budget.otherPicksSum + guess
	const picked = budget.otherPicksCount + 1
	const remaining = budget.teamCount - picked
	const left = target - total
	const abbr = budget.leagueAbbreviation

	if (remaining <= 0) {
		if (left === 0) {
			return {
				text: `That makes all ${target} ${abbr} wins, exactly what the schedule hands out.`,
				off: false,
			}
		}
		return {
			text: `That makes ${wins(total)} across all ${teams(budget.teamCount)}. The schedule hands out exactly ${target}, so you'd be ${wins(Math.abs(left))} ${left < 0 ? "over" : "under"}.`,
			off: true,
		}
	}

	if (left < 0) {
		return {
			text: `That's ${wins(total)} handed out with ${teams(remaining)} still to pick, already ${Math.abs(left)} more than the ${target} the schedule has.`,
			off: true,
		}
	}

	const average = Math.round((left / remaining) * 10) / 10
	return {
		text: `With this pick, ${total} of ${target} ${abbr} wins are handed out. ${wins(left)} left for the ${teams(remaining)} still to pick, about ${average} each.`,
		off: false,
	}
}

type RankableLeague = {
	liveGameCount: number
	currentWindowGameCount: number
	nextLockAt: string | null
}

// Home's league rail, busiest first: games on right now, then leagues with
// games in their current window, then whichever locks soonest. Window game
// counts only break ties, since a week-window league's count covers a whole
// week and isn't comparable to a day-window league's. Leagues that tie on
// everything keep the order they came in.
export function orderLeaguesByActivity<T extends RankableLeague>(
	leagues: readonly T[],
): T[] {
	return [...leagues].sort(
		(a, b) =>
			b.liveGameCount - a.liveGameCount ||
			Number(b.currentWindowGameCount > 0) -
				Number(a.currentWindowGameCount > 0) ||
			lockTime(a) - lockTime(b) ||
			b.currentWindowGameCount - a.currentWindowGameCount,
	)
}

function lockTime(league: RankableLeague) {
	return league.nextLockAt
		? Date.parse(league.nextLockAt)
		: Number.POSITIVE_INFINITY
}

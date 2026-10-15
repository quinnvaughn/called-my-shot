// Changes whenever a number on the og:image does, so an unfurl cache holding
// an older render is handed a url it has never scraped. Resolved count moves
// with every settled call, which is also when the calendar gains a shade.
export function profileCardVersion(input: {
	totalPoints: number
	resolvedCallCount: number
	rank: number | null
}): string {
	return [
		input.totalPoints,
		input.resolvedCallCount,
		input.rank ?? "unranked",
	].join("-")
}

type LeagueStats = {
	league: { id: string; name: string; abbreviation: string; slug: string }
}

export function scopedLeague<T extends LeagueStats>(
	leagues: T[],
	slug: string | undefined,
): T | null {
	return slug ? (leagues.find((row) => row.league.slug === slug) ?? null) : null
}

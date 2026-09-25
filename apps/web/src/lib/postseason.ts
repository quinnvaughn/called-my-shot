type SeriesStakes = { clinchTeamIds: string[] }

// What a series game decides, read off the teams that win the series by
// winning it: both of them makes it winner-take-all, one makes it an
// elimination game for the other. Null for any other game.
export function seriesStakesLabel(postseason: SeriesStakes): string | null {
	if (postseason.clinchTeamIds.length >= 2) return "Winner take all"
	if (postseason.clinchTeamIds.length === 1) return "Elimination game"
	return null
}

// "ALDS · Game 4", or just the round for a single-game round.
export function postseasonHeading(postseason: {
	roundLabel: string
	gameNumber: number | null
}): string {
	return postseason.gameNumber
		? `${postseason.roundLabel} · Game ${postseason.gameNumber}`
		: postseason.roundLabel
}

// "(4) New York Liberty" when the team has a known playoff seed.
export function seededName(
	name: string,
	seed: number | null | undefined,
): string {
	return seed ? `(${seed}) ${name}` : name
}

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

// The rounds on the board as one phrase. MLB's AL and NL play the same round
// side by side, so a matching pair collapses to the round's shared name
// ("Wild Card Series"); anything else is listed ("ALDS & NLDS"). Null with
// no rounds.
export function roundsPhrase(labels: string[]): string | null {
	if (labels.length === 0) return null
	const [first, second] = labels.map((label) =>
		/^(?:AL|NL) (.+)$/.exec(label)?.[1],
	)
	if (labels.length === 2 && first && first === second) return first
	return labels.length === 2 ? labels.join(" & ") : labels.join(", ")
}

// "2 elimination games", counting a winner-take-all game as one.
export function eliminationGamesLabel(count: number): string {
	return `${count} elimination game${count === 1 ? "" : "s"}`
}

// The league room's meta description during a postseason. Round labels only
// come from series, so a league whose playoff rounds are single games (NFL)
// has none, and has no series winners to call either.
export function postseasonDescription(
	leagueName: string,
	roundLabels: string[],
): string {
	const rounds = roundsPhrase(roundLabels)
	return rounds
		? `${leagueName} ${rounds} on the board. Call series winners, game winners and player lines.`
		: `The ${leagueName} postseason is on the board. Call game winners, totals and player lines.`
}

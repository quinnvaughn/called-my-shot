// Rough, explicitly-tunable placeholder for the Queue tab's "needs
// resolution" estimate (locked-time vs. typical game length per league) -
// there's no live stats feed to check an actual game-final status against,
// so this is a guess, not a confirmed signal. Keyed by league slug. A code
// constant rather than a `leagues` column: growing the Data tab's league
// modal (and its validation) for a number this rough isn't worth it yet -
// trivially edited here later if it needs to be.
const TYPICAL_GAME_LENGTH_HOURS: Record<string, number> = {
	nba: 2.5,
	nfl: 3.5,
	mlb: 3.25,
	nhl: 2.5,
}
const DEFAULT_GAME_LENGTH_HOURS = 3

export function typicalGameLengthHours(leagueSlug: string): number {
	return TYPICAL_GAME_LENGTH_HOURS[leagueSlug] ?? DEFAULT_GAME_LENGTH_HOURS
}

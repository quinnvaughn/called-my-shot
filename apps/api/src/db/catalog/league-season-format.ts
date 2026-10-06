// Static reference data, not synced from anywhere (season length changes on
// the order of once a decade, e.g. NFL going 16 -> 17 games, NHL 82 -> 84) -
// keyed by leagues.slug, same key SYNCED_LEAGUES (db/sync/leagues.ts) and
// RECURRING_QUESTION_CATALOG (db/catalog/recurring-question-catalog.ts) both
// use. Exposed on the GraphQL League type (League.seasonFormat in
// graphql/types/sports/league.ts) so the win-total guess input can bound/default
// itself (min 0, max gamesPerSeason) without duplicating this on the
// frontend.
//
// winTotalGraceDays is how long after opening day win totals stay open, and
// so how late into a season they can still be generated
// (lib/season-questions.ts).
export const LEAGUE_SEASON_FORMAT: Record<
	string,
	{ gamesPerSeason: number; winTotalGraceDays: number }
> = {
	nba: { gamesPerSeason: 82, winTotalGraceDays: 42 },
	nfl: { gamesPerSeason: 17, winTotalGraceDays: 28 },
	mlb: { gamesPerSeason: 162, winTotalGraceDays: 28 },
	nhl: { gamesPerSeason: 84, winTotalGraceDays: 28 },
}

import type { TeamSeasonStats } from "../../db/schema"
import type { StatContextDifferential } from "./types"

// How each sport measures the gap between what a team scores and what it gives
// up. Four different metrics, not one metric with four names:
//
//   net rating          points per 100 possessions, so a pace-neutral rate
//   run differential    runs, as a season total
//   point differential  points, as a season total
//   goal differential   goals, as a season total
//
// A per-game margin is a fourth thing again, and printing any of these under
// another's name claims a measurement that wasn't taken. This map is the only
// place the choice is made, and a league that isn't in it gets no figure rather
// than a plausible-looking default - "point differential" would be wrong for
// hockey, and silently wrong is worse than absent.
const METRIC_BY_LEAGUE: Record<string, StatContextDifferential["kind"]> = {
	nba: "net_rating",
	mlb: "run_differential",
	nfl: "point_differential",
	nhl: "goal_differential",
}

export function differentialKindFor(
	leagueSlug: string,
): StatContextDifferential["kind"] | null {
	return METRIC_BY_LEAGUE[leagueSlug] ?? null
}

// The figure itself, from a stored standings reading, or null when this league
// has no mapped metric or the reading lacks what the metric needs.
//
// Both totals come from ESPN's own pointDifferential rather than being
// recomputed as pointsFor minus pointsAgainst, so the number matches what a
// viewer sees if they go and look at the standings.
export function differentialFrom(
	leagueSlug: string,
	stats: TeamSeasonStats,
): StatContextDifferential | null {
	const kind = differentialKindFor(leagueSlug)
	if (!kind) return null

	if (kind === "net_rating") {
		// No possession count, no rate. A net rating is per 100 possessions by
		// definition, and there is no honest way to state one without them.
		if (!stats.possessions) return null
		return {
			kind,
			value:
				((stats.pointsFor - stats.pointsAgainst) / stats.possessions) * 100,
			games: stats.gamesPlayed,
		}
	}

	return { kind, value: stats.pointDifferential, games: stats.gamesPlayed }
}

// The same figure off this app's own completed games, for a question that
// locked before any standings reading was taken - which is every question that
// predates this table, and stays true for them forever, since ESPN serves
// standings as they are now and not as they were on some past morning.
//
// A season total is the sum of the game-by-game gaps, so this is the same
// measurement by a different route. A net rating is not: it needs a possession
// count that no game row carries, and a per-game margin published under that
// name would be a different statistic. So basketball gets nothing here rather
// than something close.
export function derivedDifferentialFrom(
	leagueSlug: string,
	results: { pointsFor: number; pointsAgainst: number }[],
): StatContextDifferential | null {
	const kind = differentialKindFor(leagueSlug)
	if (!kind || kind === "net_rating" || results.length === 0) return null

	let value = 0
	for (const result of results) value += result.pointsFor - result.pointsAgainst
	return { kind, value, games: results.length }
}

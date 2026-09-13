import type { LineRule } from "../../lib/game-questions/lines"
import type { StarterPick } from "../../lib/game-questions/pick-subjects"

// The official questions db/sync/generate-game-questions.ts posts on each
// upcoming game, on top of the who-wins question sync-game-questions.ts
// already gives every game. A discriminated union on `shape`, dispatched via
// ts-pattern in the job. Every template must settle from ESPN on its own
// (see resolutionModeFor) - game-question-catalog.test.ts holds each one to
// that.
//
// `id` is part of every generated question's generationKey, so renaming one
// makes the job treat its existing questions as a different template and
// post new ones beside them.
export type GameQuestionTemplate =
	| {
			// "How many points will X score?", once per team. The tolerance band
			// comes from the stat's own tier, so nothing here sets a number.
			id: string
			tier: number
			shape: "team_stat_numeric_guess"
			statName: string
	  }
	| {
			// Each team's best starter at the pick, head to head.
			id: string
			tier: number
			shape: "player_vs_player"
			statName: string
			pick: StarterPick
	  }
	| {
			// Each team's best starter at the pick, over/under a line set from
			// their season (see setLine in lib/game-questions/lines.ts).
			id: string
			tier: number
			shape: "player_stat_over_under"
			statName: string
			pick: StarterPick
			line: LineRule
	  }
	| {
			// Who leads the game in the stat. The options are both full rosters,
			// since auto-resolution can't settle a leader who isn't one of them.
			id: string
			tier: number
			shape: "player_game_stat_leader"
			statName: string
	  }

// The highest template tier each league gets. Raising it posts every
// template up to that tier on the next run, which is how a league's volume
// goes up. Keyed by league slug, same as SYNCED_LEAGUES.
export const GENERATION_TIER: Record<string, number> = {
	nba: 1,
	nfl: 1,
	mlb: 1,
}

const NFL_QB: StarterPick = {
	role: "offense",
	positions: ["QB"],
	espnStat: "passing.passingYards",
	priorWeight: 4,
}

const NBA_TOP_SCORER: StarterPick = {
	role: "starter",
	espnStat: "offensive.points",
	priorWeight: 12,
}

const MLB_STARTER: StarterPick = {
	role: "starting_pitcher",
	espnStat: "pitching.strikeouts",
	espnGames: "pitching.gamesStarted",
	priorWeight: 6,
}

export const GAME_QUESTION_CATALOG: Record<string, GameQuestionTemplate[]> = {
	nfl: [
		{
			id: "team-points",
			tier: 1,
			shape: "team_stat_numeric_guess",
			statName: "Points",
		},
		{
			id: "qb-passing-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Passing Yards",
			pick: NFL_QB,
		},
		{
			id: "rb-rushing-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Rushing Yards",
			pick: {
				role: "offense",
				positions: ["RB"],
				espnStat: "rushing.rushingYards",
				priorWeight: 4,
			},
		},
		{
			id: "qb-passing-yards",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Passing Yards",
			pick: NFL_QB,
			line: { minGames: 3, shade: 0.95, minLine: 150.5 },
		},
		{
			id: "receiving-yards-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Receiving Yards",
		},
	],
	nba: [
		{
			id: "team-points",
			tier: 1,
			shape: "team_stat_numeric_guess",
			statName: "Points",
		},
		{
			id: "top-scorer-points-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Points",
			pick: NBA_TOP_SCORER,
		},
		{
			id: "top-scorer-points",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Points",
			pick: NBA_TOP_SCORER,
			line: { minGames: 8, shade: 0.97, minLine: 10.5 },
		},
		{
			id: "rebounds-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Rebounds",
		},
	],
	mlb: [
		{
			id: "team-runs",
			tier: 1,
			shape: "team_stat_numeric_guess",
			statName: "Runs",
		},
		{
			id: "starter-strikeouts-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Strikeouts (Pitching)",
			pick: MLB_STARTER,
		},
		{
			id: "starter-strikeouts",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Strikeouts (Pitching)",
			pick: MLB_STARTER,
			line: { minGames: 5, shade: 0.97, minLine: 2.5 },
		},
	],
}

// The templates a league posts at its current tier.
export function activeGameTemplates(leagueSlug: string): GameQuestionTemplate[] {
	const tier = GENERATION_TIER[leagueSlug] ?? 0
	return (GAME_QUESTION_CATALOG[leagueSlug] ?? []).filter(
		(template) => template.tier <= tier,
	)
}

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
//
// `group` names the yards, catches or sacks a player template asks about. A
// game gets at most one template per group (see selectGameTemplates), so the
// same production isn't asked twice on one game: not as a head-to-head and an
// over/under, and not as rushing yards beside rushing + receiving yards.
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
			// A team's own final score over/under a line set from the games it
			// has already played, once per team. The line comes from the games
			// table rather than ESPN - see lib/game-questions/team-lines.ts.
			id: string
			tier: number
			shape: "team_stat_over_under"
			statName: string
			line: LineRule
			// How many of this season's games a team needs before last
			// season's scores stop standing in, the same blend a player line
			// uses (see blendSamples).
			priorWeight: number
			// The "category.stat" last season's stand-in is read from, since
			// that season isn't in the games table. The same key the season
			// extractor for this stat uses (see SEASON_EXTRACTORS).
			priorStat: string
			// Games of league average the opposing side's own figure is
			// regressed toward before it moves this line - see
			// opponentAdjustment. Omitted for a stat with no stored figure for
			// what an opponent gives up, which leaves its line on the subject's
			// own average.
			oppWeight?: number
	  }
	| {
			// Each team's best starter at the pick, head to head.
			id: string
			tier: number
			shape: "player_vs_player"
			statName: string
			group: string
			pick: StarterPick
	  }
	| {
			// Each team's best starter at the pick, over/under a line set from
			// their season (see setLine in lib/game-questions/lines.ts).
			id: string
			tier: number
			shape: "player_stat_over_under"
			statName: string
			group: string
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
			group: string
			// The contenders the favorite is picked from: the best per-game
			// average across both teams' candidates (see LeaderBasis in
			// lib/game-questions/leaders.ts). choose doesn't apply.
			pick: StarterPick
	  }

// The highest template tier each league gets. Raising it posts every
// template up to that tier on the next run, which is how a league's volume
// goes up. Keyed by league slug, same as SYNCED_LEAGUES.
export const GENERATION_TIER: Record<string, number> = {
	nba: 1,
	nfl: 1,
	mlb: 1,
	nhl: 1,
}

// How many player templates each game gets, drawn at random from the league's
// active ones. Team templates go up on every game on top of these.
export const PLAYER_QUESTIONS_PER_GAME: Record<string, number> = {
	nba: 3,
	nfl: 4,
	mlb: 3,
	nhl: 3,
}

const NBA_TOP_SCORER: StarterPick = {
	role: "starter",
	espnStat: "offensive.points",
	priorWeight: 12,
}

const NBA_BIG_REBOUNDER: StarterPick = {
	role: "starter",
	positions: ["PF", "C"],
	espnStat: "general.rebounds",
	priorWeight: 12,
}

const NBA_GUARD_PASSER: StarterPick = {
	role: "starter",
	positions: ["PG", "SG"],
	espnStat: "offensive.assists",
	priorWeight: 12,
}

const NBA_SHOOTER: StarterPick = {
	role: "starter",
	positions: ["PG", "SG", "SF"],
	espnStat: "offensive.threePointFieldGoalsMade",
	priorWeight: 12,
}

const NFL_QB: StarterPick = {
	role: "offense",
	positions: ["QB"],
	espnStat: "passing.passingYards",
	priorWeight: 4,
}

// The same quarterbacks, ranked and lined on every touchdown they account
// for, so a running quarterback's scores count too.
const NFL_QB_TOUCHDOWNS: StarterPick = {
	role: "offense",
	positions: ["QB"],
	espnStat: ["passing.passingTouchdowns", "rushing.rushingTouchdowns"],
	priorWeight: 4,
}

const NFL_RB: StarterPick = {
	role: "offense",
	positions: ["RB"],
	espnStat: "rushing.rushingYards",
	priorWeight: 4,
}

// The same backs, ranked and lined on what they gain carrying and catching
// together, so a pass-catching back's catches count too.
const NFL_RB_SCRIMMAGE: StarterPick = {
	role: "offense",
	positions: ["RB"],
	espnStat: ["rushing.rushingYards", "receiving.receivingYards"],
	priorWeight: 4,
}

const NFL_WR: StarterPick = {
	role: "offense",
	positions: ["WR"],
	espnStat: "receiving.receivingYards",
	priorWeight: 4,
}

const NFL_TE: StarterPick = {
	role: "offense",
	positions: ["TE"],
	espnStat: "receiving.receptions",
	priorWeight: 4,
}

// Leader contenders, wider than the single-player picks above: anyone in
// these can lead the game in the stat.
const NFL_RUSHERS: StarterPick = {
	role: "offense",
	positions: ["RB", "QB"],
	espnStat: "rushing.rushingYards",
	priorWeight: 4,
}

const nflReceivers = (espnStat: string): StarterPick => ({
	role: "offense",
	positions: ["WR", "TE", "RB"],
	espnStat,
	priorWeight: 4,
})

const NFL_DEFENDERS: StarterPick = {
	role: "defense",
	espnStat: "defensive.sacks",
	priorWeight: 4,
}

const nbaStarter = (espnStat: string): StarterPick => ({
	role: "starter",
	espnStat,
	priorWeight: 12,
})

const MLB_STARTER: StarterPick = {
	role: "starting_pitcher",
	espnStat: "pitching.strikeouts",
	espnGames: "pitching.gamesStarted",
	priorWeight: 6,
}

// The same starter, lined on pitches per start. Pitches thrown in relief
// would pull a swingman's figure down, so only starts count.
const MLB_STARTER_PITCHES: StarterPick = {
	...MLB_STARTER,
	espnStat: "pitching.pitchesAsStarter",
}

// Everyone who bats: any lineup spot, or a roster player at a fielding
// position or DH before the lineup is out. Drawn from the top three so it
// isn't the same slugger every day.
const mlbBatter = (espnStat: string): StarterPick => ({
	role: "batter",
	positions: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"],
	espnStat,
	priorWeight: 20,
	source: "roster",
	choose: 3,
})

// Every skater, from the roster: ESPN posts no NHL lineup before puck drop and
// lists nobody in the "starter" role for the NHL, so these always read the
// roster. Drawn from the top three so it isn't the same star every night.
const nhlSkater = (espnStat: string): StarterPick => ({
	role: "starter",
	positions: ["C", "LW", "RW", "D"],
	espnStat,
	priorWeight: 15,
	source: "roster",
	choose: 3,
})

// ESPN's probable starting goalie, lined on saves per start so a relief
// appearance doesn't drag the figure down.
const NHL_GOALIE: StarterPick = {
	role: "starting_goalie",
	espnStat: "defensive.saves",
	espnGames: "general.gameStarted",
	priorWeight: 6,
}

export const GAME_QUESTION_CATALOG: Record<string, GameQuestionTemplate[]> = {
	nfl: [
		{
			id: "team-points-ou",
			tier: 1,
			shape: "team_stat_over_under",
			statName: "Points",
			line: { minGames: 3, shade: 1, minLine: 10.5 },
			priorWeight: 4,
			priorStat: "scoring.totalPoints",
			// Points allowed per game, 2025: game-to-game variance 91.4 against
			// a true between-defense variance of 7.7, so 91.4 / 7.7 = 12.
			oppWeight: 12,
		},
		{
			id: "qb-passing-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Passing Yards",
			group: "passing-yards",
			pick: NFL_QB,
		},
		{
			id: "qb-passing-yards",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Passing Yards",
			group: "passing-yards",
			pick: NFL_QB,
			line: { minGames: 3, shade: 0.95, minLine: 150.5 },
		},
		{
			id: "qb-touchdowns",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Passing + Rushing Touchdowns",
			group: "qb-touchdowns",
			pick: NFL_QB_TOUCHDOWNS,
			line: { minGames: 3, shade: 0.95, minLine: 0.5 },
		},
		{
			id: "rb-rushing-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Rushing Yards",
			group: "rushing-yards",
			pick: NFL_RB,
		},
		{
			id: "rb-rushing-yards",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Rushing Yards",
			group: "rushing-yards",
			pick: NFL_RB,
			line: { minGames: 3, shade: 0.93, minLine: 30.5 },
		},
		{
			id: "rushing-yards-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Rushing Yards",
			group: "rushing-yards",
			pick: NFL_RUSHERS,
		},
		{
			id: "rb-scrimmage-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Rushing + Receiving Yards",
			group: "rushing-yards",
			pick: NFL_RB_SCRIMMAGE,
		},
		{
			id: "rb-scrimmage-yards",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Rushing + Receiving Yards",
			group: "rushing-yards",
			pick: NFL_RB_SCRIMMAGE,
			line: { minGames: 3, shade: 0.93, minLine: 40.5 },
		},
		{
			id: "wr-receiving-yards-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Receiving Yards",
			group: "receiving-yards",
			pick: NFL_WR,
		},
		{
			id: "wr-receiving-yards",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Receiving Yards",
			group: "receiving-yards",
			pick: NFL_WR,
			line: { minGames: 3, shade: 0.93, minLine: 30.5 },
		},
		{
			id: "receiving-yards-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Receiving Yards",
			group: "receiving-yards",
			pick: nflReceivers("receiving.receivingYards"),
		},
		{
			id: "te-receptions",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Receptions",
			group: "receptions",
			pick: NFL_TE,
			line: { minGames: 3, shade: 0.95, minLine: 2.5 },
		},
		{
			id: "receptions-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Receptions",
			group: "receptions",
			pick: nflReceivers("receiving.receptions"),
		},
		{
			id: "sacks-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Sacks",
			group: "sacks",
			pick: NFL_DEFENDERS,
		},
	],
	nba: [
		{
			id: "team-points-ou",
			tier: 1,
			shape: "team_stat_over_under",
			statName: "Points",
			line: { minGames: 5, shade: 1, minLine: 80.5 },
			priorWeight: 10,
			priorStat: "offensive.points",
			// Points allowed per game, 2025: 198.2 game-to-game against 15.2
			// between defenses, so 198.2 / 15.2 = 13.
			oppWeight: 13,
		},
		{
			id: "top-scorer-points-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Points",
			group: "points",
			pick: NBA_TOP_SCORER,
		},
		{
			id: "top-scorer-points",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Points",
			group: "points",
			pick: NBA_TOP_SCORER,
			line: { minGames: 8, shade: 0.97, minLine: 10.5 },
		},
		{
			id: "points-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Points",
			group: "points",
			pick: NBA_TOP_SCORER,
		},
		{
			id: "big-rebounds-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Rebounds",
			group: "rebounds",
			pick: NBA_BIG_REBOUNDER,
		},
		{
			id: "big-rebounds",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Rebounds",
			group: "rebounds",
			pick: NBA_BIG_REBOUNDER,
			line: { minGames: 8, shade: 0.97, minLine: 4.5 },
		},
		{
			id: "rebounds-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Rebounds",
			group: "rebounds",
			pick: nbaStarter("general.rebounds"),
		},
		{
			id: "guard-assists-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Assists",
			group: "assists",
			pick: NBA_GUARD_PASSER,
		},
		{
			id: "guard-assists",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Assists",
			group: "assists",
			pick: NBA_GUARD_PASSER,
			line: { minGames: 8, shade: 0.97, minLine: 3.5 },
		},
		{
			id: "assists-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Assists",
			group: "assists",
			pick: nbaStarter("offensive.assists"),
		},
		{
			id: "shooter-threes",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "3-Pointers Made",
			group: "threes",
			pick: NBA_SHOOTER,
			line: { minGames: 8, shade: 0.95, minLine: 1.5 },
		},
		{
			id: "threes-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "3-Pointers Made",
			group: "threes",
			pick: nbaStarter("offensive.threePointFieldGoalsMade"),
		},
		{
			id: "blocks-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Blocks",
			group: "blocks",
			pick: nbaStarter("defensive.blocks"),
		},
	],
	mlb: [
		{
			id: "team-runs-ou",
			tier: 1,
			shape: "team_stat_over_under",
			statName: "Runs",
			line: { minGames: 10, shade: 1, minLine: 1.5 },
			priorWeight: 20,
			priorStat: "batting.runs",
			// Runs allowed per game, 2025: 10.4 game-to-game against 0.23
			// between staffs, so 10.4 / 0.23 = 45. Baseball separates its run
			// prevention far less per game than the other two, so a line here
			// needs most of a season before the opponent moves it much.
			oppWeight: 45,
		},
		{
			id: "starter-strikeouts-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Strikeouts (Pitching)",
			group: "strikeouts",
			pick: MLB_STARTER,
		},
		{
			id: "starter-strikeouts",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Strikeouts (Pitching)",
			group: "strikeouts",
			pick: MLB_STARTER,
			line: { minGames: 5, shade: 0.97, minLine: 2.5 },
		},
		{
			id: "starter-pitches",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Pitches Thrown",
			group: "pitches",
			pick: MLB_STARTER_PITCHES,
			// The floor keeps openers out: an inning or two is 20-40 pitches, and
			// a line down there is a question about the bullpen plan.
			line: { minGames: 5, shade: 1, minLine: 60.5 },
		},
		{
			id: "batter-hits",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Hits",
			group: "hits",
			pick: mlbBatter("batting.hits"),
			line: { minGames: 15, shade: 0.9, minLine: 0.5 },
		},
		{
			id: "hits-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Hits",
			group: "hits",
			pick: mlbBatter("batting.hits"),
		},
		{
			id: "batter-rbis",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "RBIs",
			group: "rbis",
			pick: mlbBatter("batting.RBIs"),
			line: { minGames: 15, shade: 0.9, minLine: 0.5 },
		},
		{
			id: "rbis-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "RBIs",
			group: "rbis",
			pick: mlbBatter("batting.RBIs"),
		},
		{
			id: "batter-total-bases",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Total Bases",
			group: "total-bases",
			pick: mlbBatter("batting.totalBases"),
			line: { minGames: 15, shade: 0.9, minLine: 0.5 },
		},
	],
	nhl: [
		{
			id: "team-goals-ou",
			tier: 1,
			shape: "team_stat_over_under",
			statName: "Goals",
			// The line comes off final scores, which count a shootout win as a
			// goal that the question's own reading leaves out (see
			// deriveHockeyStats), so it starts about 0.06 a game high until
			// the shade is tuned.
			line: { minGames: 10, shade: 1, minLine: 1.5 },
			priorWeight: 20,
			priorStat: "offensive.goals",
			// Goals allowed per game, 2025-26: 2.9 game-to-game against 0.071
			// between teams, so 2.9 / 0.071 = 41.
			oppWeight: 41,
		},
		{
			id: "skater-shots-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Shots on Goal",
			group: "shots",
			pick: nhlSkater("offensive.shotsTotal"),
		},
		{
			id: "skater-shots",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Shots on Goal",
			group: "shots",
			pick: nhlSkater("offensive.shotsTotal"),
			line: { minGames: 10, shade: 0.95, minLine: 1.5 },
		},
		{
			id: "shots-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Shots on Goal",
			group: "shots",
			pick: nhlSkater("offensive.shotsTotal"),
		},
		{
			id: "skater-points",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Points",
			group: "points",
			pick: nhlSkater("offensive.points"),
			line: { minGames: 10, shade: 0.9, minLine: 0.5 },
		},
		{
			id: "points-leader",
			tier: 1,
			shape: "player_game_stat_leader",
			statName: "Points",
			group: "points",
			pick: nhlSkater("offensive.points"),
		},
		{
			id: "goalie-saves-duel",
			tier: 1,
			shape: "player_vs_player",
			statName: "Saves",
			group: "saves",
			pick: NHL_GOALIE,
		},
		{
			id: "goalie-saves",
			tier: 1,
			shape: "player_stat_over_under",
			statName: "Saves",
			group: "saves",
			pick: NHL_GOALIE,
			line: { minGames: 5, shade: 1, minLine: 15.5 },
		},
	],
}

// Template ids taken out of the catalog, per league slug. The job takes down
// any open, uncalled question still up from one of these, and its slot goes
// to another template on the same run. One already called stays up and
// settles as usual.
export const RETIRED_GAME_TEMPLATE_IDS: Record<string, string[]> = {
	// strikeouts-leader: nearly always one of the two starters, which the
	// strikeouts duel already asks. batter-home-runs: a batter homers in about
	// one game in five, so the line never gets off its 0.5 floor and the under
	// hits too often for any loss rate in SIDE_LOSS_RATE_BOUNDS to price out.
	mlb: ["strikeouts-leader", "batter-home-runs"],
}

// The templates a league posts at its current tier.
export function activeGameTemplates(
	leagueSlug: string,
): GameQuestionTemplate[] {
	const tier = GENERATION_TIER[leagueSlug] ?? 0
	return (GAME_QUESTION_CATALOG[leagueSlug] ?? []).filter(
		(template) => template.tier <= tier,
	)
}

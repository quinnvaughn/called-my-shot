import { match } from "ts-pattern"
import type { QuestionShape } from "./questions"

// Which questions settle themselves from ESPN data and which need a person.
// Decided per stat rather than per shape: a player's points in one game are in
// every NBA box score, while a custom advanced metric is in none. Shared by the
// API, which stores the answer on questions.resolution_mode, and the create
// form, which stops asking for a resolution source when the creator has nothing
// to check.

export type AutoResolveScope = "game" | "season"
export type AutoResolveSubject = "player" | "team"

// `leader`: whether a "who led in X" question can be settled from the stat.
// Rate stats can't - leading in batting average needs a qualifying minimum
// ESPN's numbers don't define - and neither can a game stat ESPN only reports
// one player at a time.
const leaderStat = { leader: true } as const
const nonLeaderStat = { leader: false } as const

// Keyed "league:scope:subject:catalog stat name". The API's extractor registry
// (apps/api/src/lib/auto-resolve/registry.ts) has to cover exactly these keys,
// which the type checker enforces.
export const AUTO_RESOLVE_STATS = {
	"nba:game:player:Points": leaderStat,
	"nba:game:player:3-Pointers Made": leaderStat,
	"nba:game:player:Rebounds": leaderStat,
	"nba:game:player:Assists": leaderStat,
	"nba:game:player:Turnovers": leaderStat,
	"nba:game:player:Steals": leaderStat,
	"nba:game:player:Blocks": leaderStat,
	"nba:game:player:Minutes": leaderStat,
	"nba:game:team:Points": nonLeaderStat,
	"nba:game:team:3-Pointers Made": nonLeaderStat,
	"nba:game:team:Rebounds": nonLeaderStat,
	"nba:game:team:Assists": nonLeaderStat,
	"nba:game:team:Turnovers": nonLeaderStat,
	"nba:game:team:Steals": nonLeaderStat,
	"nba:game:team:Blocks": nonLeaderStat,
	"nba:season:player:Points": leaderStat,
	"nba:season:player:3-Pointers Made": leaderStat,
	"nba:season:player:Rebounds": leaderStat,
	"nba:season:player:Assists": leaderStat,
	"nba:season:player:Turnovers": leaderStat,
	"nba:season:player:Steals": leaderStat,
	"nba:season:player:Blocks": leaderStat,
	"nba:season:player:Minutes": leaderStat,
	"nba:season:team:Points": nonLeaderStat,
	"nba:season:team:3-Pointers Made": nonLeaderStat,
	"nba:season:team:Rebounds": nonLeaderStat,
	"nba:season:team:Assists": nonLeaderStat,
	"nba:season:team:Turnovers": nonLeaderStat,
	"nba:season:team:Steals": nonLeaderStat,
	"nba:season:team:Blocks": nonLeaderStat,
	"nba:season:team:Wins": nonLeaderStat,

	"nfl:game:player:Passing Yards": leaderStat,
	"nfl:game:player:Passing Touchdowns": leaderStat,
	"nfl:game:player:Rushing Yards": leaderStat,
	"nfl:game:player:Rushing Touchdowns": leaderStat,
	"nfl:game:player:Passing + Rushing Touchdowns": leaderStat,
	"nfl:game:player:Rushing + Receiving Yards": leaderStat,
	"nfl:game:player:Receiving Yards": leaderStat,
	"nfl:game:player:Receptions": leaderStat,
	"nfl:game:player:Receiving Touchdowns": leaderStat,
	"nfl:game:player:Sacks": leaderStat,
	"nfl:game:player:Interceptions": leaderStat,
	"nfl:game:team:Points": nonLeaderStat,
	"nfl:game:team:Passing Yards": nonLeaderStat,
	"nfl:game:team:Passing Touchdowns": nonLeaderStat,
	"nfl:game:team:Rushing Yards": nonLeaderStat,
	"nfl:game:team:Rushing Touchdowns": nonLeaderStat,
	"nfl:game:team:Receiving Yards": nonLeaderStat,
	"nfl:game:team:Receptions": nonLeaderStat,
	"nfl:game:team:Receiving Touchdowns": nonLeaderStat,
	"nfl:game:team:Sacks": nonLeaderStat,
	"nfl:game:team:Interceptions": nonLeaderStat,
	"nfl:season:player:Passing Yards": leaderStat,
	"nfl:season:player:Passing Touchdowns": leaderStat,
	"nfl:season:player:Rushing Yards": leaderStat,
	"nfl:season:player:Rushing Touchdowns": leaderStat,
	"nfl:season:player:Passing + Rushing Touchdowns": leaderStat,
	"nfl:season:player:Rushing + Receiving Yards": leaderStat,
	"nfl:season:player:Receiving Yards": leaderStat,
	"nfl:season:player:Receptions": leaderStat,
	"nfl:season:player:Receiving Touchdowns": leaderStat,
	"nfl:season:player:Sacks": leaderStat,
	"nfl:season:player:Interceptions": leaderStat,
	"nfl:season:team:Points": nonLeaderStat,
	"nfl:season:team:Passing Yards": nonLeaderStat,
	"nfl:season:team:Passing Touchdowns": nonLeaderStat,
	"nfl:season:team:Rushing Yards": nonLeaderStat,
	"nfl:season:team:Rushing Touchdowns": nonLeaderStat,
	"nfl:season:team:Receiving Yards": nonLeaderStat,
	"nfl:season:team:Receptions": nonLeaderStat,
	"nfl:season:team:Receiving Touchdowns": nonLeaderStat,
	"nfl:season:team:Sacks": nonLeaderStat,
	"nfl:season:team:Interceptions": nonLeaderStat,
	"nfl:season:team:Wins": nonLeaderStat,

	"mlb:game:player:Hits": leaderStat,
	"mlb:game:player:Home Runs": leaderStat,
	"mlb:game:player:Total Bases": nonLeaderStat,
	"mlb:game:player:RBIs": leaderStat,
	"mlb:game:player:Runs": leaderStat,
	"mlb:game:player:Walks (Batting)": leaderStat,
	"mlb:game:player:Strikeouts (Batting)": leaderStat,
	"mlb:game:player:Stolen Bases": nonLeaderStat,
	"mlb:game:player:Batting Average": nonLeaderStat,
	"mlb:game:player:On-Base Percentage": nonLeaderStat,
	"mlb:game:player:Slugging Percentage": nonLeaderStat,
	"mlb:game:player:Strikeouts (Pitching)": leaderStat,
	"mlb:game:player:Earned Runs Allowed": leaderStat,
	"mlb:game:player:Saves": leaderStat,
	"mlb:game:player:Pitches Thrown": leaderStat,
	"mlb:game:player:ERA": nonLeaderStat,
	"mlb:game:player:WHIP": nonLeaderStat,
	"mlb:game:team:Hits": nonLeaderStat,
	"mlb:game:team:Home Runs": nonLeaderStat,
	"mlb:game:team:Total Bases": nonLeaderStat,
	"mlb:game:team:RBIs": nonLeaderStat,
	"mlb:game:team:Runs": nonLeaderStat,
	"mlb:game:team:Walks (Batting)": nonLeaderStat,
	"mlb:game:team:Strikeouts (Batting)": nonLeaderStat,
	"mlb:game:team:Stolen Bases": nonLeaderStat,
	"mlb:game:team:Batting Average": nonLeaderStat,
	"mlb:game:team:On-Base Percentage": nonLeaderStat,
	"mlb:game:team:Slugging Percentage": nonLeaderStat,
	"mlb:game:team:Strikeouts (Pitching)": nonLeaderStat,
	"mlb:game:team:Earned Runs Allowed": nonLeaderStat,
	"mlb:game:team:Saves": nonLeaderStat,
	"mlb:game:team:Pitches Thrown": nonLeaderStat,
	"mlb:game:team:ERA": nonLeaderStat,
	"mlb:game:team:WHIP": nonLeaderStat,
	"mlb:season:player:Hits": leaderStat,
	"mlb:season:player:Home Runs": leaderStat,
	"mlb:season:player:Total Bases": leaderStat,
	"mlb:season:player:RBIs": leaderStat,
	"mlb:season:player:Runs": leaderStat,
	"mlb:season:player:Walks (Batting)": leaderStat,
	"mlb:season:player:Strikeouts (Batting)": leaderStat,
	"mlb:season:player:Stolen Bases": leaderStat,
	"mlb:season:player:Batting Average": nonLeaderStat,
	"mlb:season:player:On-Base Percentage": nonLeaderStat,
	"mlb:season:player:Slugging Percentage": nonLeaderStat,
	"mlb:season:player:Strikeouts (Pitching)": leaderStat,
	"mlb:season:player:Earned Runs Allowed": leaderStat,
	"mlb:season:player:Saves": leaderStat,
	"mlb:season:player:Pitches Thrown": leaderStat,
	"mlb:season:player:ERA": nonLeaderStat,
	"mlb:season:player:WHIP": nonLeaderStat,
	"mlb:season:team:Hits": nonLeaderStat,
	"mlb:season:team:Home Runs": nonLeaderStat,
	"mlb:season:team:Total Bases": nonLeaderStat,
	"mlb:season:team:RBIs": nonLeaderStat,
	"mlb:season:team:Runs": nonLeaderStat,
	"mlb:season:team:Walks (Batting)": nonLeaderStat,
	"mlb:season:team:Strikeouts (Batting)": nonLeaderStat,
	"mlb:season:team:Stolen Bases": nonLeaderStat,
	"mlb:season:team:Batting Average": nonLeaderStat,
	"mlb:season:team:On-Base Percentage": nonLeaderStat,
	"mlb:season:team:Slugging Percentage": nonLeaderStat,
	"mlb:season:team:Strikeouts (Pitching)": nonLeaderStat,
	"mlb:season:team:Earned Runs Allowed": nonLeaderStat,
	"mlb:season:team:Saves": nonLeaderStat,
	"mlb:season:team:Pitches Thrown": nonLeaderStat,
	"mlb:season:team:ERA": nonLeaderStat,
	"mlb:season:team:WHIP": nonLeaderStat,
	"mlb:season:team:Wins": nonLeaderStat,

	// Goalie stats can't settle a "who led the game" question: its options are
	// both full rosters, and a skater with no saves isn't a contender.
	"nhl:game:player:Goals": leaderStat,
	"nhl:game:player:Assists": leaderStat,
	"nhl:game:player:Points": leaderStat,
	"nhl:game:player:Shots on Goal": leaderStat,
	"nhl:game:player:Hits": leaderStat,
	"nhl:game:player:Blocked Shots": leaderStat,
	"nhl:game:player:Penalty Minutes": leaderStat,
	"nhl:game:player:Saves": nonLeaderStat,
	"nhl:game:player:Goals Against": nonLeaderStat,
	"nhl:game:player:Save Percentage": nonLeaderStat,
	"nhl:game:team:Goals": nonLeaderStat,
	"nhl:game:team:Assists": nonLeaderStat,
	"nhl:game:team:Shots on Goal": nonLeaderStat,
	"nhl:game:team:Power Play Goals": nonLeaderStat,
	"nhl:game:team:Hits": nonLeaderStat,
	"nhl:game:team:Blocked Shots": nonLeaderStat,
	"nhl:game:team:Penalty Minutes": nonLeaderStat,
	"nhl:game:team:Saves": nonLeaderStat,
	"nhl:season:player:Goals": leaderStat,
	"nhl:season:player:Assists": leaderStat,
	"nhl:season:player:Points": leaderStat,
	"nhl:season:player:Shots on Goal": leaderStat,
	"nhl:season:player:Hits": leaderStat,
	"nhl:season:player:Blocked Shots": leaderStat,
	"nhl:season:player:Penalty Minutes": leaderStat,
	"nhl:season:player:Saves": leaderStat,
	"nhl:season:player:Goals Against": nonLeaderStat,
	"nhl:season:player:Save Percentage": nonLeaderStat,
	"nhl:season:player:Goals Against Average": nonLeaderStat,
	"nhl:season:team:Goals": nonLeaderStat,
	"nhl:season:team:Assists": nonLeaderStat,
	"nhl:season:team:Shots on Goal": nonLeaderStat,
	"nhl:season:team:Power Play Goals": nonLeaderStat,
	"nhl:season:team:Hits": nonLeaderStat,
	"nhl:season:team:Blocked Shots": nonLeaderStat,
	"nhl:season:team:Penalty Minutes": nonLeaderStat,
	"nhl:season:team:Saves": nonLeaderStat,
	"nhl:season:team:Wins": nonLeaderStat,
} as const satisfies Record<
	`${string}:${AutoResolveScope}:${AutoResolveSubject}:${string}`,
	{ leader: boolean }
>

export type AutoResolveStatKey = keyof typeof AUTO_RESOLVE_STATS

function isAutoResolveStatKey(key: string): key is AutoResolveStatKey {
	return key in AUTO_RESOLVE_STATS
}

// Game player stats that settle a leader but aren't a cell in the stored box
// score, so a season's worth can't be added up from player_game_stats. MLB
// saves come off the pitching-decision notes. The registry's tests hold this
// list to exactly the leader stats whose extractor has no `source`.
export const UNSTORED_GAME_LEADER_STATS: readonly AutoResolveStatKey[] = [
	"mlb:game:player:Saves",
]

export type ResolutionModeInput = {
	shape: QuestionShape
	leagueSlug: string
	// The catalog stat's name, when one is picked.
	statName: string | null | undefined
	customStat?: string | null
	statAggregation?: "total" | "per_game" | null
	// team_season_award only.
	awardName?: string | null
	awardVerb?: string | null
	picksRequired?: number | null
	awardConferences?: string[] | null
	awardDivisions?: string[] | null
}

// The registry key a question's result is read from, or null when a person has
// to resolve it.
export function autoResolveStatKeyFor(
	input: ResolutionModeInput,
): AutoResolveStatKey | null {
	const keyFor = (
		scope: AutoResolveScope,
		subject: AutoResolveSubject,
		needsLeader = false,
	): AutoResolveStatKey | null => {
		if (input.customStat?.trim() || !input.statName) return null
		const key = `${input.leagueSlug}:${scope}:${subject}:${input.statName}`
		if (!isAutoResolveStatKey(key)) return null
		return needsLeader && !AUTO_RESOLVE_STATS[key].leader ? null : key
	}

	return (
		match(input.shape)
			.returnType<AutoResolveStatKey | null>()
			.with(
				"game_total_over_under",
				"team_stat_over_under",
				"team_stat_numeric_guess",
				() => keyFor("game", "team"),
			)
			.with(
				"player_stat_over_under",
				"player_stat_numeric_guess",
				"player_vs_player",
				() => keyFor("game", "player"),
			)
			.with("player_game_stat_leader", () => keyFor("game", "player", true))
			.with(
				"team_season_stat_over_under",
				"team_vs_team_season",
				"team_season_stat_numeric_guess",
				() => keyFor("season", "team"),
			)
			.with("player_season_stat_over_under", "player_vs_player_season", () =>
				keyFor("season", "player"),
			)
			// A per-game leader has the same missing qualifying minimum as a rate
			// stat leader, so only a season total settles one.
			.with("player_season_stat_leader", () =>
				input.statAggregation === "per_game"
					? null
					: keyFor("season", "player", true),
			)
			// A game key, not a season one: ESPN's season totals don't split a
			// traded player's year by team, so this adds up the stored box scores
			// of the subject team's games instead.
			.with("player_team_season_stat_leader", () => {
				const key = keyFor("game", "player", true)
				return key && !UNSTORED_GAME_LEADER_STATS.includes(key) ? key : null
			})
			.with(
				"team_vs_team",
				"yes_no_prop",
				"player_season_award",
				"team_season_award",
				"player_award_finalists",
				() => null,
			)
			.exhaustive()
	)
}

// Keyed "league:award name", plus ":conference" for a conference title. The
// API's matcher (apps/api/src/lib/auto-resolve/championship.ts) names the
// postseason round that decides each one.
const CHAMPIONSHIPS = [
	"nba:NBA Finals",
	"nba:Conference Finals:East",
	"nba:Conference Finals:West",
	"nfl:Super Bowl",
	"nfl:Championship:AFC",
	"nfl:Championship:NFC",
	"mlb:World Series",
	"mlb:Pennant:AL",
	"mlb:Pennant:NL",
	"nhl:Stanley Cup",
	"nhl:Conference Final:East",
	"nhl:Conference Final:West",
] as const

export type ChampionshipKey = (typeof CHAMPIONSHIPS)[number]

function isChampionshipKey(key: string): key is ChampionshipKey {
	return (CHAMPIONSHIPS as readonly string[]).includes(key)
}

// The championship a team award names, or null for any other award. Each of
// these crowns one team from a whole league or one conference of it, so a
// question asking for more picks or narrowed to a division isn't one of them.
export function championshipKeyFor(
	input: Pick<
		ResolutionModeInput,
		| "leagueSlug"
		| "awardName"
		| "awardVerb"
		| "picksRequired"
		| "awardConferences"
		| "awardDivisions"
	>,
): ChampionshipKey | null {
	const conferences = input.awardConferences ?? []
	if (
		input.picksRequired !== 1 ||
		input.awardVerb !== "win" ||
		(input.awardDivisions?.length ?? 0) > 0 ||
		conferences.length > 1
	) {
		return null
	}
	const key = [input.leagueSlug, input.awardName?.trim(), ...conferences].join(
		":",
	)
	return isChampionshipKey(key) ? key : null
}

// team_vs_team settles off the final score and a championship off the
// postseason results, rather than a stat.
export function resolutionModeFor(
	input: ResolutionModeInput,
): "system" | "manual" {
	if (input.shape === "team_vs_team") return "system"
	if (input.shape === "team_season_award") {
		return championshipKeyFor(input) ? "system" : "manual"
	}
	return autoResolveStatKeyFor(input) ? "system" : "manual"
}

// What a system question names as its resolution source, in place of one the
// creator would otherwise have typed.
export function autoResolutionSource(
	scope: AutoResolveScope | "postseason",
): string {
	return match(scope)
		.with("game", () => "ESPN box score")
		.with("season", () => "ESPN regular-season stats")
		.with("postseason", () => "ESPN postseason results")
		.exhaustive()
}

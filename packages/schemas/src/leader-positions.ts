import type { AutoResolveStatKey } from "./auto-resolve"

// Who can plausibly lead a stat, so a "who led in X" pool leaves out the
// players who never record it: no quarterbacks in a sacks pool, no pitchers in
// a hits pool, no goalies in a shots pool. Shared by the game-question
// generator, createQuestion and the create form's pool preview, which all
// have to build the same pool. A pool that drops the eventual leader voids
// the question (gradePoolLeader in apps/api/src/lib/auto-resolve/decide.ts),
// so an entry only cuts positions that don't lead the stat in practice.
//
// A player qualifies when their primary position is one of `primary`, or when
// any position they're listed at is one of `listed`. Primary is what decides
// in MLB, where the listed positions are every spot a player has appeared at:
// a catcher who threw a mop-up inning is listed as a reliever. `listed`
// catches the exception, a two-way starter whose primary tag is DH.
export type LeaderPool = {
	primary: readonly string[]
	listed?: readonly string[]
}

type LeaderPoolKey = AutoResolveStatKey extends infer Key
	? Key extends `${infer League}:${string}:player:${infer Stat}`
		? `${League}:${Stat}`
		: never
	: never

const NFL_QUARTERBACKS: LeaderPool = { primary: ["QB"] }
const NFL_RUSHERS: LeaderPool = { primary: ["QB", "RB", "FB", "WR", "TE"] }
const NFL_RECEIVERS: LeaderPool = { primary: ["WR", "TE", "RB", "FB"] }
const NFL_PASS_RUSHERS: LeaderPool = {
	primary: ["DE", "DT", "LB", "CB", "S", "DB"],
}
const NFL_BACK_SEVEN: LeaderPool = { primary: ["LB", "CB", "S", "DB"] }

const MLB_BATTERS: LeaderPool = {
	primary: ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"],
}
const MLB_PITCHERS: LeaderPool = {
	primary: ["SP", "RP", "P"],
	listed: ["SP"],
}

const NHL_SKATERS: LeaderPool = { primary: ["C", "LW", "RW", "D"] }
const NHL_GOALIES: LeaderPool = { primary: ["G"] }

// Keyed "league:catalog stat name", the same for game and season questions.
// A stat with no entry is open to every position, which covers the NBA:
// anyone on the floor can lead any of its box-score stats.
const LEADER_POOLS: Partial<Record<LeaderPoolKey, LeaderPool>> = {
	"nfl:Passing Yards": NFL_QUARTERBACKS,
	"nfl:Passing Touchdowns": NFL_QUARTERBACKS,
	"nfl:Passing + Rushing Touchdowns": NFL_QUARTERBACKS,
	"nfl:Rushing Yards": NFL_RUSHERS,
	"nfl:Rushing Touchdowns": NFL_RUSHERS,
	"nfl:Rushing + Receiving Yards": { primary: ["RB", "FB"] },
	"nfl:Receiving Yards": NFL_RECEIVERS,
	"nfl:Receptions": NFL_RECEIVERS,
	"nfl:Receiving Touchdowns": NFL_RECEIVERS,
	"nfl:Sacks": NFL_PASS_RUSHERS,
	"nfl:Interceptions": NFL_BACK_SEVEN,

	"mlb:Hits": MLB_BATTERS,
	"mlb:Home Runs": MLB_BATTERS,
	"mlb:Total Bases": MLB_BATTERS,
	"mlb:RBIs": MLB_BATTERS,
	"mlb:Runs": MLB_BATTERS,
	"mlb:Walks (Batting)": MLB_BATTERS,
	"mlb:Strikeouts (Batting)": MLB_BATTERS,
	"mlb:Stolen Bases": MLB_BATTERS,
	"mlb:Batting Average": MLB_BATTERS,
	"mlb:On-Base Percentage": MLB_BATTERS,
	"mlb:Slugging Percentage": MLB_BATTERS,
	"mlb:Strikeouts (Pitching)": MLB_PITCHERS,
	"mlb:Earned Runs Allowed": MLB_PITCHERS,
	"mlb:Saves": MLB_PITCHERS,
	"mlb:Pitches Thrown": MLB_PITCHERS,
	"mlb:ERA": MLB_PITCHERS,
	"mlb:WHIP": MLB_PITCHERS,

	"nhl:Goals": NHL_SKATERS,
	"nhl:Assists": NHL_SKATERS,
	"nhl:Points": NHL_SKATERS,
	"nhl:Shots on Goal": NHL_SKATERS,
	"nhl:Hits": NHL_SKATERS,
	"nhl:Blocked Shots": NHL_SKATERS,
	"nhl:Penalty Minutes": NHL_SKATERS,
	"nhl:Saves": NHL_GOALIES,
	"nhl:Goals Against": NHL_GOALIES,
	"nhl:Save Percentage": NHL_GOALIES,
	"nhl:Goals Against Average": NHL_GOALIES,
}

export function leaderPoolFor(
	leagueSlug: string,
	statName: string | null | undefined,
): LeaderPool | null {
	if (!statName) return null
	return LEADER_POOLS[`${leagueSlug}:${statName}` as LeaderPoolKey] ?? null
}

// Whether a player belongs in the pool for a leader question on this stat.
// Every player does when the stat has no entry, or isn't a catalog stat.
export function canLeadStat(
	player: { position: string | null; positions: readonly string[] },
	leagueSlug: string,
	statName: string | null | undefined,
): boolean {
	const pool = leaderPoolFor(leagueSlug, statName)
	if (!pool) return true
	if (player.position && pool.primary.includes(player.position)) return true
	return player.positions.some((position) => pool.listed?.includes(position))
}

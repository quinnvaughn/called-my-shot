import { sql } from "drizzle-orm"
import { db } from "../../db"
import { boxStatSourceFor } from "../stat-context/stat-source"
import type { RatioPair } from "./line-calibration"

// How a stat swings around what a player or team was averaging going into
// each game, read straight off the stored box scores: every game with at
// least BOX_PRIOR_GAMES before it in its own season, as that game's result
// over the average of the ones before. A spread for pricing a head-to-head, a
// leader pool or a who-wins from (see duel-pricing.ts) that doesn't wait on
// generated over/unders to resolve, which only some games get: a few weeks of
// box scores carry hundreds of results where the over/unders carry a few
// dozen.
//
// Every stored season counts, most recent first. How much a stat swings game
// to game hardly moves from one season to the next, so last season's games
// stand in for a new season's first weeks, the way last season stands in for
// a player's own average (see blendSamples). An average only ever reaches
// back within its own season, though: a game is measured against what that
// player was doing that year, not across a summer of roster changes.
//
// The expectation here is the season so far, not the blended, opponent-moved
// figure a generated line is set from, so it reads a little wider than a line
// pool would. That only makes a price more cautious, and a template's own
// resolved lines take over once there are enough of them.

// The fewest games before one, that season, for its average to count as an
// expectation. Two is noisy, which widens the spread rather than narrowing it.
export const BOX_PRIOR_GAMES = 2

// The most recent results a spread is read from. Recent enough to follow how a
// stat plays now, wide enough that a handful of odd games barely move it.
export const BOX_SPREAD_WINDOW = 400

// How many of each team's players a game contributes, ranked by what they
// were averaging going in. A spread for pricing starters shouldn't be read
// off how much a backup's two catches swing around his one.
const PLAYERS_PER_TEAM = 2

export type BoxSpread = { ratios: number[]; pairs: RatioPair[] }

const EMPTY: BoxSpread = { ratios: [], pairs: [] }

type Row = {
	game_id: string
	is_home: boolean
	ratio: number | string
	team_rank: number | string
}

// Each side's ratios, and each game's pair of the two teams' top sides.
function spreadFrom(rows: Row[]): BoxSpread {
	const ratios: number[] = []
	const byGame = new Map<string, Partial<RatioPair>>()
	for (const row of rows) {
		const ratio = Number(row.ratio)
		if (!Number.isFinite(ratio)) continue
		ratios.push(ratio)
		if (Number(row.team_rank) !== 1) continue
		const pair = byGame.get(row.game_id) ?? {}
		pair[row.is_home ? "home" : "away"] ??= ratio
		byGame.set(row.game_id, pair)
	}
	const pairs: RatioPair[] = []
	for (const { home, away } of byGame.values()) {
		if (home !== undefined && away !== undefined) pairs.push({ home, away })
	}
	return { ratios, pairs }
}

// A player stat's spread, from each team's top PLAYERS_PER_TEAM by average
// going into each game. Pairs are each game's two top players.
export async function playerBoxSpread(input: {
	leagueId: string
	leagueSlug: string
	statName: string
	asOf: Date
}): Promise<BoxSpread> {
	const source = boxStatSourceFor({
		shape: "player_stat_over_under",
		leagueSlug: input.leagueSlug,
		statName: input.statName,
	})
	if (source?.subject !== "player") return EMPTY
	const { rows } = await db.execute<Row>(sql`
		with per_game as (
			select player_id, season_id, game_id, team_id, is_home, game_date,
				sum(value_numeric) as value
			from player_game_stats
			where league_id = ${input.leagueId}
				and stat_key in ${[...source.statKeys]}
				and game_date < ${input.asOf}
				and not did_not_play
				and value_numeric is not null
				and player_id is not null
			group by player_id, season_id, game_id, team_id, is_home, game_date
		), with_prior as (
			select *,
				avg(value) over prior as prior_mean,
				count(*) over prior as prior_games
			from per_game
			window prior as (
				partition by player_id, season_id order by game_date
				rows between unbounded preceding and 1 preceding
			)
		), ranked as (
			select *,
				row_number() over (
					partition by game_id, team_id order by prior_mean desc
				) as team_rank
			from with_prior
			where prior_games >= ${BOX_PRIOR_GAMES} and prior_mean > 0
		)
		select game_id, is_home, value / prior_mean as ratio, team_rank
		from ranked
		where team_rank <= ${PLAYERS_PER_TEAM}
		order by game_date desc
		limit ${BOX_SPREAD_WINDOW}
	`)
	return spreadFrom(rows)
}

// A team's final score's spread, one result per team per game, paired by
// game. regularSeasonOnly leaves postseason games out of the results, though
// a postseason game's average going in still counts every game before it.
export async function teamScoreBoxSpread(input: {
	leagueId: string
	asOf: Date
	regularSeasonOnly?: boolean
}): Promise<BoxSpread> {
	const { rows } = await db.execute<Row>(sql`
		with per_game as (
			select t.team_id, t.season_id, t.game_id, t.is_home, t.game_date,
				g.season_type, sum(t.value_numeric) as value
			from team_game_stats t
			join games g on g.id = t.game_id
			where t.league_id = ${input.leagueId}
				and t.scope = 'final_score'
				and t.game_date < ${input.asOf}
				and t.value_numeric is not null
			group by t.team_id, t.season_id, t.game_id, t.is_home, t.game_date,
				g.season_type
		), with_prior as (
			select *,
				avg(value) over prior as prior_mean,
				count(*) over prior as prior_games
			from per_game
			window prior as (
				partition by team_id, season_id order by game_date
				rows between unbounded preceding and 1 preceding
			)
		)
		select game_id, is_home, value / prior_mean as ratio, 1 as team_rank
		from with_prior
		where prior_games >= ${BOX_PRIOR_GAMES} and prior_mean > 0
			and (${!input.regularSeasonOnly} or season_type = 'regular')
		order by game_date desc
		limit ${BOX_SPREAD_WINDOW}
	`)
	return spreadFrom(rows)
}

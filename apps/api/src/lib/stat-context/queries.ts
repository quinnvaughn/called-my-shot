import { sql } from "drizzle-orm"
import { db } from "../../db"
import type {
	StatContextGame,
	StatContextOpponentAllowed,
	StatContextRest,
	StatContextShare,
	StatContextSplit,
} from "./types"

// What every query below is scoped by. asOf is the question's lock time, and
// every query is strictly before it: a resolved question's page has to show
// the pregame picture, not one contaminated by the game being asked about.
export type StatContextScope = {
	playerId: string | null
	teamId: string
	opponentTeamId: string | null
	seasonId: string
	statKey: string
	asOf: Date
	// The line the question asks about, when it has one, so a split can say
	// how often it was cleared.
	ouLine: number | null
	positions: string[]
}

const num = (v: unknown): number => Number(v ?? 0)

function toSplit(
	row: { games: unknown; total: unknown; over_line: unknown } | undefined,
	hasLine: boolean,
): StatContextSplit | null {
	if (!row || num(row.games) === 0) return null
	const games = num(row.games)
	const total = num(row.total)
	return {
		games,
		total,
		mean: total / games,
		overLine: hasLine ? num(row.over_line) : null,
	}
}

// The last N appearances, most recent first. Games sat out are included so the
// log can show them as a night off rather than silently shortening the window.
export async function recentGames(
	scope: StatContextScope,
	lastN: number,
): Promise<StatContextGame[]> {
	if (!scope.playerId) return []
	const { rows } = await db.execute<{
		game_id: string
		game_date: Date
		opponent_team_id: string
		is_home: boolean
		value_numeric: string | null
		did_not_play: boolean
	}>(sql`
		select game_id, game_date, opponent_team_id, is_home, value_numeric, did_not_play
		from player_game_stats
		where player_id = ${scope.playerId}
			and stat_key = ${scope.statKey}
			and game_date < ${scope.asOf}
		order by game_date desc
		limit ${lastN}
	`)

	return rows.map((row) => ({
		gameId: row.game_id,
		date: new Date(row.game_date),
		opponentTeamId: row.opponent_team_id,
		isHome: row.is_home,
		value: row.value_numeric === null ? null : Number(row.value_numeric),
		didNotPlay: row.did_not_play,
	}))
}

// Sums the season so far. Appearances only - a night off is not a zero, and
// averaging it in would understate every player who has ever been rested.
export async function seasonToDate(
	scope: StatContextScope,
): Promise<StatContextSplit | null> {
	if (!scope.playerId) return null
	const { rows } = await db.execute<{
		games: string
		total: string
		over_line: string
	}>(sql`
		select
			count(*) as games,
			coalesce(sum(value_numeric), 0) as total,
			count(*) filter (where value_numeric > ${scope.ouLine ?? 0}) as over_line
		from player_game_stats
		where player_id = ${scope.playerId}
			and stat_key = ${scope.statKey}
			and season_id = ${scope.seasonId}
			and game_date < ${scope.asOf}
			and not did_not_play
			and value_numeric is not null
	`)
	return toSplit(rows[0], scope.ouLine !== null)
}

export async function homeAwaySplit(scope: StatContextScope): Promise<{
	home: StatContextSplit | null
	away: StatContextSplit | null
}> {
	if (!scope.playerId) return { home: null, away: null }
	const { rows } = await db.execute<{
		is_home: boolean
		games: string
		total: string
		over_line: string
	}>(sql`
		select
			is_home,
			count(*) as games,
			coalesce(sum(value_numeric), 0) as total,
			count(*) filter (where value_numeric > ${scope.ouLine ?? 0}) as over_line
		from player_game_stats
		where player_id = ${scope.playerId}
			and stat_key = ${scope.statKey}
			and season_id = ${scope.seasonId}
			and game_date < ${scope.asOf}
			and not did_not_play
			and value_numeric is not null
		group by is_home
	`)

	const hasLine = scope.ouLine !== null
	return {
		home: toSplit(
			rows.find((r) => r.is_home),
			hasLine,
		),
		away: toSplit(
			rows.find((r) => !r.is_home),
			hasLine,
		),
	}
}

// Splits the season on the subject's own median days of rest - see
// StatContextRest for why that rather than fixed day counts. Null when there
// aren't two appearances to measure a gap between, or when every gap is the
// same length (a fixed weekly schedule), in which case there is no split to
// draw and saying so beats inventing one.
export async function restSplit(
	scope: StatContextScope,
): Promise<StatContextRest | null> {
	if (!scope.playerId) return null
	const { rows } = await db.execute<{
		median_rest: string | null
		short_games: string
		short_total: string
		short_over: string
		long_games: string
		long_total: string
		long_over: string
	}>(sql`
		with appearances as (
			select
				value_numeric,
				extract(epoch from (
					game_date - lag(game_date) over (order by game_date)
				)) / 86400 as rest_days
			from player_game_stats
			where player_id = ${scope.playerId}
				and stat_key = ${scope.statKey}
				and season_id = ${scope.seasonId}
				and game_date < ${scope.asOf}
				and not did_not_play
				and value_numeric is not null
		),
		rested as (select * from appearances where rest_days is not null),
		median as (
			select percentile_cont(0.5) within group (order by rest_days) as m
			from rested
		)
		select
			(select m from median) as median_rest,
			count(*) filter (where rest_days < (select m from median)) as short_games,
			coalesce(sum(value_numeric) filter (where rest_days < (select m from median)), 0) as short_total,
			count(*) filter (where rest_days < (select m from median) and value_numeric > ${scope.ouLine ?? 0}) as short_over,
			count(*) filter (where rest_days >= (select m from median)) as long_games,
			coalesce(sum(value_numeric) filter (where rest_days >= (select m from median)), 0) as long_total,
			count(*) filter (where rest_days >= (select m from median) and value_numeric > ${scope.ouLine ?? 0}) as long_over
		from rested
	`)

	const row = rows[0]
	if (!row || row.median_rest === null) return null

	const hasLine = scope.ouLine !== null
	const short = toSplit(
		{
			games: row.short_games,
			total: row.short_total,
			over_line: row.short_over,
		},
		hasLine,
	)
	const long = toSplit(
		{ games: row.long_games, total: row.long_total, over_line: row.long_over },
		hasLine,
	)
	// Every gap identical means the median splits nothing off.
	if (!short) return null

	return {
		medianRestDays: Number(row.median_rest),
		shortRest: short,
		longRest: long,
	}
}

// What the opposing team has given up in this stat, per game. Summed per game
// first and then averaged, so this is "what the opponent allows in a night",
// not "what one player averages against them".
//
// Filtered by position when the subject has one on file, because what a
// defense allows to tight ends and what it allows overall are different
// claims. An athlete with no player row is counted in the unfiltered number
// and drops out of the filtered one, which is correct: we don't know their
// position, so we can't honestly claim they belong in a position bucket.
export async function opponentAllowed(
	scope: StatContextScope,
): Promise<StatContextOpponentAllowed | null> {
	if (!scope.opponentTeamId) return null
	const filterByPosition = scope.positions.length > 0

	const { rows } = await db.execute<{
		games: string
		mean_allowed: string
	}>(sql`
		with per_game as (
			select s.game_id, sum(s.value_numeric) as allowed
			from player_game_stats s
			${
				// sql.param, not a bare array: a bare one is spread into a
				// parameter per element, which Postgres then reads as a
				// malformed array literal.
				filterByPosition
					? sql`join players p on p.id = s.player_id and p.positions && ${sql.param(scope.positions)}::text[]`
					: sql``
			}
			where s.opponent_team_id = ${scope.opponentTeamId}
				and s.stat_key = ${scope.statKey}
				and s.season_id = ${scope.seasonId}
				and s.game_date < ${scope.asOf}
				and s.value_numeric is not null
			group by s.game_id
		)
		select count(*) as games, coalesce(avg(allowed), 0) as mean_allowed
		from per_game
	`)

	const row = rows[0]
	if (!row || num(row.games) === 0) return null

	return {
		teamId: scope.opponentTeamId,
		games: num(row.games),
		meanAllowed: num(row.mean_allowed),
		positions: filterByPosition ? scope.positions : [],
	}
}

// The subject's share of what their own team produced, over the games they
// appeared in. The denominator is the stored player-table total rather than a
// sum of the player rows: ESPN's printed totals include production credited to
// no individual, so summing would inflate the share.
export async function shareOfTeamTotal(
	scope: StatContextScope,
): Promise<StatContextShare | null> {
	if (!scope.playerId) return null
	const { rows } = await db.execute<{
		games: string
		player_total: string
		team_total: string | null
	}>(sql`
		with mine as (
			select game_id, value_numeric
			from player_game_stats
			where player_id = ${scope.playerId}
				and stat_key = ${scope.statKey}
				and season_id = ${scope.seasonId}
				and game_date < ${scope.asOf}
				and not did_not_play
				and value_numeric is not null
		)
		select
			(select count(*) from mine) as games,
			(select coalesce(sum(value_numeric), 0) from mine) as player_total,
			(
				select sum(t.value_numeric)
				from team_game_stats t
				where t.team_id = ${scope.teamId}
					and t.scope = 'player_table_total'
					and t.stat_key = ${scope.statKey}
					and t.game_id in (select game_id from mine)
			) as team_total
	`)

	const row = rows[0]
	if (!row || num(row.games) === 0) return null
	const teamTotal = row.team_total === null ? 0 : Number(row.team_total)
	// No team denominator means this stat isn't carried in the player tables'
	// totals row, so there's no share to state.
	if (teamTotal <= 0) return null

	const playerTotal = num(row.player_total)
	return {
		playerTotal,
		teamTotal,
		sharePct: (playerTotal / teamTotal) * 100,
		games: num(row.games),
	}
}

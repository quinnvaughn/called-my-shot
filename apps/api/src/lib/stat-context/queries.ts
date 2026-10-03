import { type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import type {
	StatContextGame,
	StatContextOpponentAllowed,
	StatContextPoolDefense,
	StatContextRankedPlayer,
	StatContextRest,
	StatContextShare,
	StatContextSplit,
	StatContextUsage,
	StatContextWorkload,
	UsageStat,
	WorkloadStat,
} from "./types"

// What every query below is scoped by. asOf is the question's lock time, and
// every query is strictly before it: a resolved question's page has to show
// the pregame picture, not one contaminated by the game being asked about.
export type StatContextScope = {
	// Which side the cards are about. A player question reads
	// player_game_stats; a team question reads team_game_stats, which is where
	// team box columns and the final score both live.
	subjectKind: "player" | "team"
	playerId: string | null
	teamId: string
	// Which team_game_stats scope holds this stat, for a team subject. Null
	// for a player subject.
	teamScope: "team_box" | "player_table_total" | "final_score" | null
	opponentTeamId: string | null
	seasonId: string
	// The raw keys the stat adds up, usually one. Every query sums them per
	// game before anything else, so a game is one appearance whatever the
	// count.
	statKeys: string[]
	asOf: Date
	// The line the question asks about, when it has one, so a split can say
	// how often it was cleared.
	ouLine: number | null
	positions: string[]
}

const num = (v: unknown): number => Number(v ?? 0)

// One row per appearance for whichever side this scope is about, in a shape
// both tables can produce. Every aggregate below builds on this, so a team
// question and a player question run the same SQL over different tables
// rather than needing two copies of each.
//
// A team has no did_not_play - a team always plays its own game - so that
// column is synthesised rather than every caller having to care which table
// it came from. A player's is the same on every one of their rows for a game.
function appearances(scope: StatContextScope, seasonOnly: boolean): SQL {
	const season = seasonOnly ? sql`and season_id = ${scope.seasonId}` : sql``
	if (scope.subjectKind === "team") {
		return sql`
			select game_id, game_date, opponent_team_id, is_home,
				sum(value_numeric) as value_numeric, false as did_not_play
			from team_game_stats
			where team_id = ${scope.teamId}
				and scope = ${scope.teamScope}
				and stat_key in ${scope.statKeys}
				and game_date < ${scope.asOf}
				${season}
			group by game_id, game_date, opponent_team_id, is_home
		`
	}
	return sql`
		select game_id, game_date, opponent_team_id, is_home,
			sum(value_numeric) as value_numeric, bool_or(did_not_play) as did_not_play
		from player_game_stats
		where player_id = ${scope.playerId}
			and stat_key in ${scope.statKeys}
			and game_date < ${scope.asOf}
			${season}
		group by game_id, game_date, opponent_team_id, is_home
	`
}

// The same, narrowed to this season and to games actually played with a number
// recorded - what every average is built from.
function scored(scope: StatContextScope): SQL {
	return sql`
		select * from (${appearances(scope, true)}) season_rows
		where not did_not_play and value_numeric is not null
	`
}

// A player question needs a player to be about; a team question always has
// its team.
function hasSubject(scope: StatContextScope): boolean {
	return scope.subjectKind === "team" || scope.playerId !== null
}

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
	if (!hasSubject(scope)) return []

	const { rows } = await db.execute<{
		game_id: string
		game_date: Date
		opponent_team_id: string
		is_home: boolean
		value_numeric: string | null
		did_not_play: boolean
	}>(sql`
		select * from (${appearances(scope, false)}) all_rows
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
	if (!hasSubject(scope)) return null

	const { rows } = await db.execute<{
		games: string
		total: string
		over_line: string
	}>(sql`
		select
			count(*) as games,
			coalesce(sum(value_numeric), 0) as total,
			count(*) filter (where value_numeric > ${scope.ouLine ?? 0}) as over_line
		from (${scored(scope)}) played
	`)
	return toSplit(rows[0], scope.ouLine !== null)
}

export async function homeAwaySplit(scope: StatContextScope): Promise<{
	home: StatContextSplit | null
	away: StatContextSplit | null
}> {
	if (!hasSubject(scope)) return { home: null, away: null }

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
		from (${scored(scope)}) played
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
	if (!hasSubject(scope)) return null

	const { rows } = await db.execute<{
		median_rest: string | null
		short_games: string
		short_total: string
		short_over: string
		long_games: string
		long_total: string
		long_over: string
	}>(sql`
		with played as (
			select
				value_numeric,
				extract(epoch from (
					game_date - lag(game_date) over (order by game_date)
				)) / 86400 as rest_days
			from (${scored(scope)}) season_played
		),
		rested as (select * from played where rest_days is not null),
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

// What the opposing side has given up in this stat, per game.
//
// For a player question that means summing every opposing player's line within
// a game and then averaging, so it reads as "what they allow in a night"
// rather than "what one player averages against them", and it can be narrowed
// to the subject's position. For a team question the team's own row already is
// the per-game figure, so there is nothing to sum and no position to narrow to.
export async function opponentAllowed(
	scope: StatContextScope,
): Promise<StatContextOpponentAllowed | null> {
	if (!scope.opponentTeamId) return null

	const filterByPosition =
		scope.subjectKind === "player" && scope.positions.length > 0

	const perGame =
		scope.subjectKind === "team"
			? sql`
				select sum(value_numeric) as allowed
				from team_game_stats
				where opponent_team_id = ${scope.opponentTeamId}
					and scope = ${scope.teamScope}
					and stat_key in ${scope.statKeys}
					and season_id = ${scope.seasonId}
					and game_date < ${scope.asOf}
					and value_numeric is not null
				group by game_id
			`
			: sql`
				select sum(s.value_numeric) as allowed
				from player_game_stats s
				${
					filterByPosition
						? sql`join players p on p.id = s.player_id and p.positions && ${sql.param(scope.positions)}::text[]`
						: sql``
				}
				where s.opponent_team_id = ${scope.opponentTeamId}
					and s.stat_key in ${scope.statKeys}
					and s.season_id = ${scope.seasonId}
					and s.game_date < ${scope.asOf}
					and s.value_numeric is not null
				group by s.game_id
			`

	const { rows } = await db.execute<{
		games: string
		mean_allowed: string
	}>(sql`
		select count(*) as games, coalesce(avg(allowed), 0) as mean_allowed
		from (${perGame}) per_game
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
//
// Player questions only - a team's share of its own total is always 100%.
export async function shareOfTeamTotal(
	scope: StatContextScope,
): Promise<StatContextShare | null> {
	if (scope.subjectKind !== "player" || !scope.playerId) return null

	const { rows } = await db.execute<{
		games: string
		player_total: string
		team_total: string | null
	}>(sql`
		with mine as (
			select game_id, sum(value_numeric) as value_numeric
			from player_game_stats
			where player_id = ${scope.playerId}
				and stat_key in ${scope.statKeys}
				and season_id = ${scope.seasonId}
				and game_date < ${scope.asOf}
				and not did_not_play
				and value_numeric is not null
			group by game_id
		)
		select
			(select count(*) from mine) as games,
			(select coalesce(sum(value_numeric), 0) from mine) as player_total,
			(
				select sum(t.value_numeric)
				from team_game_stats t
				where t.team_id = ${scope.teamId}
					and t.scope = 'player_table_total'
					and t.stat_key in ${scope.statKeys}
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

// How much work the subject is actually being given, in the column that hands
// it out: targets behind receiving yards, carries behind rushing yards. Both
// halves come back - a per-game count and a share of the team's - because they
// answer different objections. Ten targets a game is volume whoever else is
// on the field; a third of the team's is volume that survives a game script.
//
// The same query as shareOfTeamTotal over a different column, which is exactly
// what this is, so the denominator rule it documents holds here too.
export async function usageOfTeam(
	scope: StatContextScope,
	usage: UsageStat,
): Promise<StatContextUsage | null> {
	const share = await shareOfTeamTotal({
		...scope,
		statKeys: [...usage.statKeys],
	})
	if (!share) return null

	return {
		label: usage.label,
		games: share.games,
		perGame: share.playerTotal / share.games,
		sharePct: share.sharePct,
	}
}

// How much of a game the subject is out there for, per appearance this
// season. The same average seasonToDate takes, over a different column, so a
// game sat out stays out of it the same way.
export async function workloadPerGame(
	scope: StatContextScope,
	workload: WorkloadStat,
): Promise<StatContextWorkload | null> {
	const split = await seasonToDate({
		...scope,
		statKeys: [...workload.statKeys],
		ouLine: null,
	})
	if (!split) return null

	return { label: workload.label, games: split.games, perGame: split.mean }
}

// What each side of a leader question's game has been giving up in the pooled
// stat, per game. The same measurement opponentAllowed makes for a one-sided
// card, run for both teams at once, so the two cards can't disagree about what
// a defense allows.
//
// A team with no completed game is left out rather than returned as a zero,
// which would read as the stingiest defense in the league.
export async function poolDefenses(
	scope: Pick<StatContextScope, "seasonId" | "statKeys" | "asOf">,
	teamIds: string[],
): Promise<StatContextPoolDefense[]> {
	if (teamIds.length === 0) return []

	const { rows } = await db.execute<{
		team_id: string
		games: string
		mean_allowed: string
	}>(sql`
		select opponent_team_id as team_id,
			count(*) as games,
			avg(allowed) as mean_allowed
		from (
			select opponent_team_id, game_id, sum(value_numeric) as allowed
			from player_game_stats
			where opponent_team_id in ${teamIds}
				and stat_key in ${scope.statKeys}
				and season_id = ${scope.seasonId}
				and game_date < ${scope.asOf}
				and value_numeric is not null
			group by opponent_team_id, game_id
		) per_game
		group by opponent_team_id
	`)

	const byTeam = new Map(rows.map((row) => [row.team_id, row]))
	// In the order asked for, which is the order the game's two sides were
	// given in, rather than whatever the group by happened to emit.
	return teamIds.flatMap((teamId) => {
		const row = byTeam.get(teamId)
		if (!row || num(row.games) === 0) return []
		return [
			{
				teamId,
				games: num(row.games),
				meanAllowed: num(row.mean_allowed),
			},
		]
	})
}

// One name a leader question could be answered with, and the side of the game
// they are on. Which defense a candidate faces is a fact about the fixture
// rather than about the stored rows, so it is handed in rather than looked up.
export type PoolCandidate = {
	playerId: string
	opponentTeamId: string | null
	isHome: boolean
}

// The pool of a "who leads this game" question, ordered by what each candidate
// is averaging this season, best first.
//
// Ranks on the per-game mean rather than the season total, because a pool is
// every player on both teams and totals would just sort by who has been
// healthy. Candidates with no stored appearance are left out entirely - a
// zero would rank them as genuinely bad rather than unknown, and the point of
// the list is who is in front.
export async function poolRanking(
	scope: Pick<StatContextScope, "seasonId" | "statKeys" | "asOf">,
	candidates: PoolCandidate[],
	limit: number,
): Promise<StatContextRankedPlayer[]> {
	if (candidates.length === 0) return []
	const playerIds = candidates.map((candidate) => candidate.playerId)

	const { rows } = await db.execute<{
		player_id: string
		name: string
		games: string
		mean: string
	}>(sql`
		select g.player_id, p.name,
			count(*) as games,
			avg(g.value) as mean
		from (
			select player_id, game_id, sum(value_numeric) as value
			from player_game_stats
			where player_id in ${playerIds}
				and stat_key in ${scope.statKeys}
				and season_id = ${scope.seasonId}
				and game_date < ${scope.asOf}
				and not did_not_play
				and value_numeric is not null
			group by player_id, game_id
		) g
		join players p on p.id = g.player_id
		group by g.player_id, p.name
		order by mean desc
		limit ${limit}
	`)

	const byPlayer = new Map(
		candidates.map((candidate) => [candidate.playerId, candidate]),
	)
	return rows.map((row) => {
		const candidate = byPlayer.get(row.player_id)
		return {
			playerId: row.player_id,
			label: row.name,
			games: num(row.games),
			mean: num(row.mean),
			opponentTeamId: candidate?.opponentTeamId ?? null,
			isHome: candidate?.isHome ?? false,
		}
	})
}

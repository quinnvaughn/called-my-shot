import { type SQL, sql } from "drizzle-orm"
import { db } from "../../db"

// The batched reads behind a page of card facts. Each takes every request on
// the page at once as a VALUES list and returns one series per request, most
// recent game first, so a game page with fifteen cards costs the same three
// queries as one with a single card.
//
// Every request carries its own cutoff (the question's lock), and every read
// is strictly before it: a card on a locked or settled question still has to
// describe the pregame picture, not one that includes the game being asked
// about.

export const FACT_LAST_N = 10

export type SeriesGame = { gameId: string; value: number }

type Keyed = { reqId: string; statKeys: readonly string[] }

export type PlayerSeriesRequest = Keyed & { playerId: string; asOf: Date }

export type TeamSeriesRequest = Keyed & {
	teamId: string
	scope: "team_box" | "player_table_total" | "final_score"
	asOf: Date
}

export type GameTotalRequest = {
	reqId: string
	teamId: string
	seasonId: string
	asOf: Date
}

export type GameMaxRequest = Keyed & { gameIds: string[] }

// A raw timestamp column holds UTC wall time, so the cutoff goes in as UTC
// wall time too rather than through the driver's local-zone serialisation.
const utc = (date: Date) =>
	sql`(${date.toISOString()}::timestamptz at time zone 'UTC')`

const values = (rows: SQL[]) => sql.join(rows, sql`, `)

// One row per (request, stat key), so a stat that adds several keys up joins
// each of them.
function keyRows(requests: Keyed[]): SQL {
	return values(
		requests.flatMap((r) =>
			r.statKeys.map((key) => sql`(${r.reqId}::text, ${key}::text)`),
		),
	)
}

function bySeries(
	rows: { req_id: string; game_id: string; value: string | number }[],
): Map<string, SeriesGame[]> {
	const series = new Map<string, SeriesGame[]>()
	for (const row of rows) {
		const list = series.get(row.req_id) ?? []
		list.push({ gameId: row.game_id, value: Number(row.value) })
		series.set(row.req_id, list)
	}
	return series
}

// A player's last FACT_LAST_N games played, across seasons. A night off isn't
// a game, and neither is a row with no number on it.
export async function playerSeries(
	requests: PlayerSeriesRequest[],
): Promise<Map<string, SeriesGame[]>> {
	if (requests.length === 0) return new Map()
	const { rows } = await db.execute<{
		req_id: string
		game_id: string
		value: string
	}>(sql`
		with req(req_id, player_id, as_of) as (
			values ${values(
				requests.map(
					(r) => sql`(${r.reqId}::text, ${r.playerId}::uuid, ${utc(r.asOf)})`,
				),
			)}
		),
		req_key(req_id, stat_key) as (values ${keyRows(requests)}),
		per_game as (
			select r.req_id, p.game_id, p.game_date, sum(p.value_numeric) as value
			from req r
			join req_key k on k.req_id = r.req_id
			join player_game_stats p
				on p.player_id = r.player_id
				and p.stat_key = k.stat_key
				and p.game_date < r.as_of
			where not p.did_not_play
			group by r.req_id, p.game_id, p.game_date
			having count(p.value_numeric) > 0
		)
		select req_id, game_id, value from (
			select *, row_number() over (
				partition by req_id order by game_date desc, game_id
			) as rn
			from per_game
		) ranked
		where rn <= ${FACT_LAST_N}
		order by req_id, rn
	`)
	return bySeries(rows)
}

// A team's last FACT_LAST_N games in the team_game_stats scope its stat
// resolves from, across seasons.
export async function teamSeries(
	requests: TeamSeriesRequest[],
): Promise<Map<string, SeriesGame[]>> {
	if (requests.length === 0) return new Map()
	const { rows } = await db.execute<{
		req_id: string
		game_id: string
		value: string
	}>(sql`
		with req(req_id, team_id, scope, as_of) as (
			values ${values(
				requests.map(
					(r) =>
						sql`(${r.reqId}::text, ${r.teamId}::uuid, ${r.scope}::team_game_stat_scope, ${utc(r.asOf)})`,
				),
			)}
		),
		req_key(req_id, stat_key) as (values ${keyRows(requests)}),
		per_game as (
			select r.req_id, t.game_id, t.game_date, sum(t.value_numeric) as value
			from req r
			join req_key k on k.req_id = r.req_id
			join team_game_stats t
				on t.team_id = r.team_id
				and t.scope = r.scope
				and t.stat_key = k.stat_key
				and t.game_date < r.as_of
			group by r.req_id, t.game_id, t.game_date
			having count(t.value_numeric) > 0
		)
		select req_id, game_id, value from (
			select *, row_number() over (
				partition by req_id order by game_date desc, game_id
			) as rn
			from per_game
		) ranked
		where rn <= ${FACT_LAST_N}
		order by req_id, rn
	`)
	return bySeries(rows)
}

// Both sides' final scores added up, over a team's last FACT_LAST_N finished
// games this season. The same games and the same sum a game total's matchup
// card counts its line against (see recordOf in ../stat-context/matchup.ts).
export async function gameTotalSeries(
	requests: GameTotalRequest[],
): Promise<Map<string, SeriesGame[]>> {
	if (requests.length === 0) return new Map()
	const { rows } = await db.execute<{
		req_id: string
		game_id: string
		value: string
	}>(sql`
		with req(req_id, team_id, season_id, as_of) as (
			values ${values(
				requests.map(
					(r) =>
						sql`(${r.reqId}::text, ${r.teamId}::uuid, ${r.seasonId}::uuid, ${utc(r.asOf)})`,
				),
			)}
		),
		per_game as (
			select r.req_id, g.id as game_id, g.starts_at,
				g.home_score + g.away_score as value
			from req r
			join games g
				on (g.home_team_id = r.team_id or g.away_team_id = r.team_id)
				and g.season_id = r.season_id
				and g.starts_at < r.as_of
			where g.status = 'final'
				and g.home_score is not null
				and g.away_score is not null
		)
		select req_id, game_id, value from (
			select *, row_number() over (
				partition by req_id order by starts_at desc, game_id
			) as rn
			from per_game
		) ranked
		where rn <= ${FACT_LAST_N}
		order by req_id, rn
	`)
	return bySeries(rows)
}

// The most anyone recorded in the stat in each of the given games, both teams
// counted, by request then game. Summed per athlete rather than per player so
// someone not yet linked to a player still counts, the same way leading a
// game is graded.
export async function gameMaxima(
	requests: GameMaxRequest[],
): Promise<Map<string, Map<string, number>>> {
	const pairs = requests.flatMap((r) =>
		r.gameIds.map((gameId) => sql`(${r.reqId}::text, ${gameId}::uuid)`),
	)
	if (pairs.length === 0) return new Map()
	const { rows } = await db.execute<{
		req_id: string
		game_id: string
		max_value: string
	}>(sql`
		with pair(req_id, game_id) as (values ${values(pairs)}),
		req_key(req_id, stat_key) as (values ${keyRows(requests)}),
		per_athlete as (
			select pr.req_id, pr.game_id, p.source_athlete_id,
				sum(p.value_numeric) as value
			from pair pr
			join req_key k on k.req_id = pr.req_id
			join player_game_stats p
				on p.game_id = pr.game_id
				and p.stat_key = k.stat_key
			group by pr.req_id, pr.game_id, p.source_athlete_id
		)
		select req_id, game_id, max(value) as max_value
		from per_athlete
		group by req_id, game_id
	`)
	const maxima = new Map<string, Map<string, number>>()
	for (const row of rows) {
		const byGame = maxima.get(row.req_id) ?? new Map<string, number>()
		byGame.set(row.game_id, Number(row.max_value))
		maxima.set(row.req_id, byGame)
	}
	return maxima
}

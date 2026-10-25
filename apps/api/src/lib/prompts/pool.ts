import {
	and,
	arrayOverlaps,
	desc,
	eq,
	ilike,
	inArray,
	max,
	min,
	type SQL,
	sql,
	sum,
} from "drizzle-orm"
import { db } from "../../db"
import {
	leagues,
	type Player,
	type Prompt,
	playerFranchiseStints,
	players,
	teams,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"

// Who can go on a Rushmore for a prompt. A franchise prompt picks from
// everyone who played for that team; a league prompt from everyone who
// played for any team in the league, and a prompt with no league from
// everyone who played in any of them. Outside a franchise a player is counted
// once however many teams they played for, at their best score with any of
// them.
//
// A prompt's positions and years narrow that to the stints that fit: one
// played at any of the positions, overlapping the years. Years are calendar
// years, and a season split across two (an NBA or NHL season, stored as the
// year it ended) spans both, so 2009-10 counts as playing in 2009 and 2010.
//
// The years are what the picker shows beside a name ("1957-1969"): the
// stint's for a franchise, first season to last across every stint that
// counts otherwise.
export type PoolEntry = {
	player: Player
	firstSeason: number
	lastSeason: number
	seasons: number
	score: number
	hallOfFame: boolean
}

export type PoolScope = Pick<
	Prompt,
	"leagueId" | "teamId" | "positions" | "fromYear" | "toYear"
>

// Leagues whose seasons run across two calendar years.
const SPLIT_SEASON_LEAGUES = ["NBA", "NHL"]

const DEFAULT_POOL_PAGE = 20
const MAX_POOL_PAGE = 50

// The stint conditions a prompt sets, over player_franchise_stints joined to
// teams and leagues.
function fits(prompt: PoolScope): (SQL | undefined)[] {
	const startsYearEarlier = sql`(case when ${leagues.abbreviation} in (${sql.join(
		SPLIT_SEASON_LEAGUES.map((abbreviation) => sql`${abbreviation}`),
		sql`, `,
	)}) then 1 else 0 end)`
	return [
		prompt.teamId ? eq(playerFranchiseStints.teamId, prompt.teamId) : undefined,
		prompt.leagueId ? eq(teams.leagueId, prompt.leagueId) : undefined,
		prompt.positions.length > 0
			? arrayOverlaps(playerFranchiseStints.positions, prompt.positions)
			: undefined,
		prompt.fromYear !== null
			? sql`${playerFranchiseStints.lastSeason} >= ${prompt.fromYear}`
			: undefined,
		prompt.toYear !== null
			? sql`${playerFranchiseStints.firstSeason} - ${startsYearEarlier} <= ${prompt.toYear}`
			: undefined,
	]
}

export async function rushmorePool(
	prompt: PoolScope,
	{ search, first }: { search?: string | null; first?: number | null } = {},
): Promise<PoolEntry[]> {
	const limit = Math.min(Math.max(first ?? DEFAULT_POOL_PAGE, 1), MAX_POOL_PAGE)
	const term = search?.trim()
	const nameFilter = term ? ilike(players.name, `%${term}%`) : undefined

	if (prompt.teamId) {
		const rows = await db
			.select({ player: players, stint: playerFranchiseStints })
			.from(playerFranchiseStints)
			.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
			.innerJoin(leagues, eq(leagues.id, teams.leagueId))
			.innerJoin(players, eq(players.id, playerFranchiseStints.playerId))
			.where(and(...fits(prompt), nameFilter))
			.orderBy(desc(playerFranchiseStints.score), players.name)
			.limit(limit)
		return rows.map(({ player, stint }) => ({
			player,
			firstSeason: stint.firstSeason,
			lastSeason: stint.lastSeason,
			seasons: stint.seasons,
			score: stint.score,
			hallOfFame: stint.hallOfFame,
		}))
	}

	const best = max(playerFranchiseStints.score)
	const rows = await db
		.select({
			player: players,
			firstSeason: min(playerFranchiseStints.firstSeason),
			lastSeason: max(playerFranchiseStints.lastSeason),
			seasons: sum(playerFranchiseStints.seasons).mapWith(Number),
			score: best,
			hallOfFame: sql<boolean>`bool_or(${playerFranchiseStints.hallOfFame})`,
		})
		.from(playerFranchiseStints)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.innerJoin(players, eq(players.id, playerFranchiseStints.playerId))
		.where(and(...fits(prompt), nameFilter))
		.groupBy(players.id)
		.orderBy(desc(best), players.name)
		.limit(limit)
	return rows.map((row) => ({
		player: row.player,
		firstSeason: row.firstSeason ?? 0,
		lastSeason: row.lastSeason ?? 0,
		seasons: row.seasons ?? 0,
		score: Number(row.score ?? 0),
		hallOfFame: Boolean(row.hallOfFame),
	}))
}

// Every league these players played in between them.
export async function leaguesPlayedIn(
	q: DbOrTx,
	playerIds: string[],
): Promise<string[]> {
	if (playerIds.length === 0) return []
	const rows = await q
		.selectDistinct({ leagueId: teams.leagueId })
		.from(playerFranchiseStints)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.where(inArray(playerFranchiseStints.playerId, playerIds))
	return rows.map((row) => row.leagueId)
}

// Which of these players are in the prompt's pool.
export async function playersInPool(
	q: DbOrTx,
	prompt: PoolScope,
	playerIds: string[],
): Promise<Set<string>> {
	if (playerIds.length === 0) return new Set()
	const rows = await q
		.selectDistinct({ playerId: playerFranchiseStints.playerId })
		.from(playerFranchiseStints)
		.innerJoin(teams, eq(teams.id, playerFranchiseStints.teamId))
		.innerJoin(leagues, eq(leagues.id, teams.leagueId))
		.where(
			and(...fits(prompt), inArray(playerFranchiseStints.playerId, playerIds)),
		)
	return new Set(rows.map((row) => row.playerId))
}

import {
	and,
	eq,
	ilike,
	inArray,
	isNotNull,
	max,
	min,
	sql,
	sum,
} from "drizzle-orm"
import { db } from "../../db"
import {
	draftEntries,
	type Player,
	playerFranchiseStints,
	players,
	teams,
} from "../../db/schema"
import type { DbOrTx } from "../../db/types"
import { isHistoryLeague } from "../franchise-history/franchise-map"
import { HALL_OF_FAME_BONUS } from "../franchise-history/types"
import type { DraftClassPrompt } from "./class"

// Who can go in a redraft of a class: everyone drafted that year who this
// app has a player for, and everyone who came into the league undrafted that
// year. Best careers first, by the franchise histories' scores summed over
// every team he played for in the league (with a Hall of Famer's bonus
// counted once, not once per team), then by where he was picked.
export type RedraftPoolEntry = {
	player: Player
	// Where he went in this draft; null when he came in undrafted.
	overall: number | null
	firstSeason: number | null
	lastSeason: number | null
	hallOfFame: boolean
}

const DEFAULT_POOL_PAGE = 20
const MAX_POOL_PAGE = 50

function inClass(prompt: DraftClassPrompt) {
	if (!prompt.leagueId || prompt.draftYear === null) {
		throw new Error("Not a draft class prompt")
	}
	return and(
		eq(draftEntries.leagueId, prompt.leagueId),
		eq(draftEntries.year, prompt.draftYear),
		isNotNull(draftEntries.playerId),
	)
}

export async function redraftPool(
	prompt: DraftClassPrompt,
	{ search, first }: { search?: string | null; first?: number | null } = {},
): Promise<RedraftPoolEntry[]> {
	const limit = Math.min(Math.max(first ?? DEFAULT_POOL_PAGE, 1), MAX_POOL_PAGE)
	const term = search?.trim()
	const league = await db.query.leagues.findFirst({
		where: { id: prompt.leagueId ?? "" },
		columns: { slug: true },
	})
	const bonus =
		league && isHistoryLeague(league.slug) ? HALL_OF_FAME_BONUS[league.slug] : 0
	const career = sql`coalesce(${sum(playerFranchiseStints.score)}, 0) - case when bool_or(${playerFranchiseStints.hallOfFame}) then (count(*) - 1) * ${bonus} else 0 end`
	const rows = await db
		.select({
			player: players,
			overall: draftEntries.overall,
			firstSeason: min(playerFranchiseStints.firstSeason),
			lastSeason: max(playerFranchiseStints.lastSeason),
			hallOfFame: sql<boolean>`coalesce(bool_or(${playerFranchiseStints.hallOfFame}), false)`,
		})
		.from(draftEntries)
		.innerJoin(players, eq(players.id, draftEntries.playerId))
		.leftJoin(
			playerFranchiseStints,
			and(
				eq(playerFranchiseStints.playerId, players.id),
				inArray(
					playerFranchiseStints.teamId,
					db
						.select({ id: teams.id })
						.from(teams)
						.where(eq(teams.leagueId, draftEntries.leagueId)),
				),
			),
		)
		.where(
			and(inClass(prompt), term ? ilike(players.name, `%${term}%`) : undefined),
		)
		.groupBy(players.id, draftEntries.overall)
		.orderBy(
			sql`${career} desc`,
			sql`${draftEntries.overall} asc nulls last`,
			players.name,
		)
		.limit(limit)
	return rows.map((row) => ({
		player: row.player,
		overall: row.overall,
		firstSeason: row.firstSeason,
		lastSeason: row.lastSeason,
		hallOfFame: Boolean(row.hallOfFame),
	}))
}

// Which of these players are in the class.
export async function playersInClass(
	q: DbOrTx,
	prompt: DraftClassPrompt,
	playerIds: string[],
): Promise<Set<string>> {
	if (playerIds.length === 0) return new Set()
	const rows = await q
		.select({ playerId: draftEntries.playerId })
		.from(draftEntries)
		.where(and(inClass(prompt), inArray(draftEntries.playerId, playerIds)))
	return new Set(rows.flatMap((row) => (row.playerId ? [row.playerId] : [])))
}

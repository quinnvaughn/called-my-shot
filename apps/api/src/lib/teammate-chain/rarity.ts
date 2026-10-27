import { and, count, eq, sql } from "drizzle-orm"
import { db } from "../../db"
import { teammateChainResults } from "../../db/schema"

// How a solved chain compares with everyone else's on the same day: how
// many solved it, how many took the very same route, and how many went
// through each player in it. Counted live, so early in the day it's "so
// far" and it settles as the day goes.
export type ChainRarity = {
	// Solved games on the puzzle, this one included.
	solvers: number
	// Of those, how many have exactly this route, this one included.
	sameRoute: number
	// Each player in the route, in order.
	players: { playerId: string; count: number; share: number }[]
}

export function chainShare(part: number, whole: number): number {
	return whole === 0 ? 0 : part / whole
}

// `unsaved` counts a game that isn't stored (a guest's) as one more solve,
// so a guest sees the same numbers they'd see signed in.
export async function loadChainRarity(
	puzzleId: string,
	route: readonly string[],
	{ unsaved = false }: { unsaved?: boolean } = {},
): Promise<ChainRarity> {
	const solvedOn = and(
		eq(teammateChainResults.puzzleId, puzzleId),
		eq(teammateChainResults.solved, true),
	)
	const routeArray = sql`array[${sql.join(
		route.map((id) => sql`${id}`),
		sql`, `,
	)}]::uuid[]`
	const [[solvers], [same], usage] = await Promise.all([
		db.select({ n: count() }).from(teammateChainResults).where(solvedOn),
		db
			.select({ n: count() })
			.from(teammateChainResults)
			.where(and(solvedOn, sql`${teammateChainResults.route} = ${routeArray}`)),
		db
			.execute<{ player_id: string; n: number }>(sql`
				select player_id, count(*)::int as n
				from (
					select unnest(${teammateChainResults.route}) as player_id
					from ${teammateChainResults}
					where ${and(solvedOn, sql`${teammateChainResults.route} && ${routeArray}`)}
				) used
				group by player_id
			`)
			.then((result) => result.rows),
	])
	const extra = unsaved ? 1 : 0
	const total = (solvers?.n ?? 0) + extra
	const used = new Map(usage.map((row) => [row.player_id, row.n]))
	return {
		solvers: total,
		sameRoute: (same?.n ?? 0) + extra,
		players: route.map((id) => {
			const n = (used.get(id) ?? 0) + extra
			return { playerId: id, count: n, share: chainShare(n, total) }
		}),
	}
}

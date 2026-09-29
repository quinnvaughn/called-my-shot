import { db } from "../../db"
import { scopedSourceId } from "../../db/sync/sync-refs"

const ESPN_ATHLETE = /ESPN athlete (\d+)/g

// Failure details written before the resolver carried ESPN's display names
// say "ESPN athlete 5273759". This swaps in the player's name wherever the
// roster sync has linked that id, and leaves the id where it hasn't.
export async function nameEspnAthletes<
	T extends { leagueSlug: string | null; failureDetail: string | null },
>(rows: T[]): Promise<T[]> {
	const sourceIds = new Set<string>()
	for (const { leagueSlug, failureDetail } of rows) {
		if (!leagueSlug) continue
		for (const [, espnId] of failureDetail?.matchAll(ESPN_ATHLETE) ?? []) {
			sourceIds.add(scopedSourceId(leagueSlug, espnId))
		}
	}
	if (sourceIds.size === 0) return rows

	const refs = await db.query.externalRefs.findMany({
		where: {
			source: "espn",
			entityType: "player",
			sourceId: { in: [...sourceIds] },
		},
	})
	const players = await db.query.players.findMany({
		where: { id: { in: refs.map((r) => r.entityId) } },
		columns: { id: true, name: true },
	})
	const nameByPlayerId = new Map(players.map((p) => [p.id, p.name]))
	const nameBySourceId = new Map(
		refs.flatMap((r) => {
			const name = nameByPlayerId.get(r.entityId)
			return name ? [[r.sourceId, name] as const] : []
		}),
	)

	return rows.map((row) => {
		const { leagueSlug } = row
		if (!leagueSlug) return row
		return {
			...row,
			failureDetail:
				row.failureDetail?.replace(
					ESPN_ATHLETE,
					(original, espnId: string) =>
						nameBySourceId.get(scopedSourceId(leagueSlug, espnId)) ?? original,
				) ?? null,
		}
	})
}

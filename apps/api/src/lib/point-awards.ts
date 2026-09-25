import { and, eq, sql } from "drizzle-orm"
import { type PointAwardKind, pointAwards, userSeasonStats } from "../db/schema"
import type { Tx } from "../db/types"

// What one rebuild owns. Every award in a scope is written by the same
// rebuild, which always knows the scope's full set, so it can replace it
// wholesale: a streak track's milestones, a slate's sweeps.
export const pointAwardScope = {
	streak: (userId: string, leagueId: string, family: string) =>
		`${userId}:${leagueId}:${family}`,
	slate: (leagueId: string, slateKey: string) => `${leagueId}:${slateKey}`,
}

export type DesiredAward = {
	userId: string
	leagueId: string
	seasonId: string
	sourceKey: string
	points: number
}

type SeasonDelta = { userId: string; leagueId: string; seasonId: string }

// Makes one scope hold exactly `desired`, and moves user_season_stats.
// bonusPoints by the difference. An award whose points or season changed is
// replaced, not adjusted, so the ledger never holds a row that doesn't match
// what the scope earns now. A zero-point award isn't stored.
//
// Idempotent: a rebuild that finds nothing changed writes nothing.
export async function reconcileAwards(
	tx: Tx,
	kind: PointAwardKind,
	scopeKey: string,
	desired: DesiredAward[],
): Promise<void> {
	const existing = await tx
		.select()
		.from(pointAwards)
		.where(and(eq(pointAwards.kind, kind), eq(pointAwards.scopeKey, scopeKey)))
	const wanted = new Map(
		desired
			.filter((award) => award.points !== 0)
			.map((award) => [award.sourceKey, award]),
	)

	const deltas = new Map<string, SeasonDelta & { points: number }>()
	const addDelta = (at: SeasonDelta, points: number) => {
		const key = `${at.userId}:${at.seasonId}`
		const entry = deltas.get(key) ?? { ...at, points: 0 }
		entry.points += points
		deltas.set(key, entry)
	}

	for (const row of existing) {
		const next = wanted.get(row.sourceKey)
		if (
			next &&
			next.userId === row.userId &&
			next.leagueId === row.leagueId &&
			next.seasonId === row.seasonId &&
			next.points === row.points
		) {
			wanted.delete(row.sourceKey)
			continue
		}
		await tx.delete(pointAwards).where(eq(pointAwards.id, row.id))
		addDelta(row, -row.points)
	}

	for (const award of wanted.values()) {
		await tx.insert(pointAwards).values({ ...award, kind, scopeKey })
		addDelta(award, award.points)
	}

	for (const delta of deltas.values()) {
		if (delta.points === 0) continue
		await tx
			.insert(userSeasonStats)
			.values({
				userId: delta.userId,
				leagueId: delta.leagueId,
				seasonId: delta.seasonId,
				bonusPoints: delta.points,
			})
			.onConflictDoUpdate({
				target: [userSeasonStats.userId, userSeasonStats.seasonId],
				set: {
					bonusPoints: sql`${userSeasonStats.bonusPoints} + ${delta.points}`,
				},
			})
	}
}

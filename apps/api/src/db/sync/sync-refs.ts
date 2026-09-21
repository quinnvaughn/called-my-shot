import { db } from "../index"
import { externalRefs, type syncEntityType } from "../schema"
import type { Tx } from "../types"

type EntityType = (typeof syncEntityType.enumValues)[number]

// Looks up the domain row id (teams.id / players.id / games.id) already
// mapped to this ESPN id, if any - null means "not synced yet, insert it".
export async function findRefEntityId(
	tx: Tx,
	entityType: EntityType,
	sourceId: string,
): Promise<string | null> {
	const ref = await tx.query.externalRefs.findFirst({
		where: { source: "espn", entityType, sourceId },
	})
	return ref?.entityId ?? null
}

// ESPN ids are only unique within a sport - NBA team "1" and NFL team "1"
// are different teams. Scope every sourceId by league so refs across
// leagues never collide.
export function scopedSourceId(leagueSlug: string, espnId: string): string {
	return `${leagueSlug}:${espnId}`
}

// The inverse of scopedSourceId: the bare ESPN id a stored sourceId carries.
export const espnIdOf = (sourceId: string) => sourceId.split(":")[1] ?? sourceId

// The bare ESPN id each of these domain rows was synced from, keyed by row id.
// A row with no ref is simply missing from the map.
export async function loadEspnIds(
	entityType: EntityType,
	entityIds: string[],
): Promise<Map<string, string>> {
	const unique = [...new Set(entityIds)]
	if (unique.length === 0) return new Map()
	const refs = await db.query.externalRefs.findMany({
		where: { source: "espn", entityType, entityId: { in: unique } },
	})
	return new Map(refs.map((ref) => [ref.entityId, espnIdOf(ref.sourceId)]))
}

// Flips a loadEspnIds map to look domain rows up by ESPN id.
export const byEspnId = (espnIds: Map<string, string>) =>
	new Map([...espnIds].map(([entityId, espnId]) => [espnId, entityId]))

// The reverse of findRefEntityId - given a domain row's own id (a games.id,
// a teams.id), find the ESPN sourceId it was synced from, if any. Needed by
// db/sync/sync-live-scores.ts, which starts from a game already in this
// app's DB and has to get back to "which ESPN event/team is this" to know
// what to re-fetch - every other sync file only ever needs the forward
// direction (ESPN id in, domain id out).
export async function findSourceId(
	tx: Tx,
	entityType: EntityType,
	entityId: string,
): Promise<string | null> {
	const ref = await tx.query.externalRefs.findFirst({
		where: { source: "espn", entityType, entityId },
	})
	return ref?.sourceId ?? null
}

export async function linkRef(
	tx: Tx,
	entityType: EntityType,
	sourceId: string,
	entityId: string,
): Promise<void> {
	await tx
		.insert(externalRefs)
		.values({ source: "espn", entityType, sourceId, entityId })
		.onConflictDoUpdate({
			target: [
				externalRefs.source,
				externalRefs.entityType,
				externalRefs.sourceId,
			],
			set: { entityId },
		})
}

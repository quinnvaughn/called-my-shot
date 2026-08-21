import type { db } from "../index"
import { externalRefs, type syncEntityType } from "../schema"

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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
			target: [externalRefs.source, externalRefs.entityType, externalRefs.sourceId],
			set: { entityId },
		})
}

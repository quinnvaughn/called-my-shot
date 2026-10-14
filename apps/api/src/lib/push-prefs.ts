import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { type PushPreferenceType, pushOptOuts } from "../db/schema"
import type { DbOrTx } from "../db/types"

export async function mutedPushTypes(
	userId: string,
): Promise<PushPreferenceType[]> {
	const rows = await db
		.select({ type: pushOptOuts.type })
		.from(pushOptOuts)
		.where(eq(pushOptOuts.userId, userId))
	return rows.map((r) => r.type)
}

// Each user's muted types, "all" included, for a drain about to push to them.
// Read at send time rather than at enqueue, so muting a type during a push's
// hold still counts.
export async function loadPushMutes(
	userIds: string[],
	tx: DbOrTx = db,
): Promise<Map<string, Set<PushPreferenceType>>> {
	const byUser = new Map<string, Set<PushPreferenceType>>()
	if (userIds.length === 0) return byUser
	const rows = await tx
		.select({ userId: pushOptOuts.userId, type: pushOptOuts.type })
		.from(pushOptOuts)
		.where(inArray(pushOptOuts.userId, userIds))
	for (const row of rows) {
		const types = byUser.get(row.userId) ?? new Set()
		types.add(row.type)
		byUser.set(row.userId, types)
	}
	return byUser
}

export function isPushMuted(
	mutes: Set<PushPreferenceType> | undefined,
	type: PushPreferenceType,
): boolean {
	return Boolean(mutes && (mutes.has("all") || mutes.has(type)))
}

// Several types at once, because one settings toggle covers a group of them.
export async function setPushPreference(
	userId: string,
	types: PushPreferenceType[],
	enabled: boolean,
): Promise<void> {
	if (types.length === 0) return
	if (enabled) {
		await db
			.delete(pushOptOuts)
			.where(
				and(eq(pushOptOuts.userId, userId), inArray(pushOptOuts.type, types)),
			)
		return
	}
	await db
		.insert(pushOptOuts)
		.values(types.map((type) => ({ userId, type })))
		.onConflictDoNothing({ target: [pushOptOuts.userId, pushOptOuts.type] })
}

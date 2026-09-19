import { eq } from "drizzle-orm"
import { flairs, userFlairs } from "../../db/schema"
import type { Tx } from "../user-season-stats"

// Gives a user a flair, once, ever. Returns whether this call is the one that
// granted it.
//
// The insert IS the check, the same shape and for the same reason as
// announceOnce in lib/streaks/notices.ts: the streak pipeline rebuilds a track
// from scratch every time one of its questions settles, so it re-detects the
// same 10-run over and over. onConflictDoNothing on the composite primary key
// means only the first detection writes, and a rebuild after a dispute
// overturn can't double-grant.
//
// A grant is never taken back. A void or an overturn that shortens the run
// this came from leaves the row standing, which deliberately breaks the
// "everything here is a rebuildable cache" contract the rest of the streak
// tables keep: pulling an earned flair off someone because an unrelated
// question got voided is worse than letting them keep it.
//
// An unknown key returns false instead of throwing. This runs inside the
// transaction that settles a question, and a catalog entry that hasn't synced
// yet must not be able to fail a resolution.
export async function grantFlairByKey(
	tx: Tx,
	userId: string,
	key: string,
): Promise<boolean> {
	const flair = await tx
		.select({ id: flairs.id })
		.from(flairs)
		.where(eq(flairs.key, key))
		.limit(1)
	const row = flair[0]
	if (!row) return false

	const granted = await tx
		.insert(userFlairs)
		.values({ userId, flairId: row.id })
		.onConflictDoNothing()
		.returning({ flairId: userFlairs.flairId })

	return granted.length > 0
}

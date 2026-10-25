import { createHash } from "node:crypto"
import { eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { players } from "../../db/schema"
import { putObject } from "../storage"

// Portraits live in R2 under the player, named by a hash of their bytes: a
// rebuild that changes anything gets a new key, so the immutable
// caching on every stored image never serves a stale face.
export function portraitKey(playerId: string, png: Buffer): string {
	const hash = createHash("sha256").update(png).digest("hex").slice(0, 16)
	return `portraits/${playerId}/${hash}.png`
}

export async function savePortrait(
	playerId: string,
	png: Buffer,
): Promise<string> {
	const key = portraitKey(playerId, png)
	await putObject(key, png, "image/png")
	await db
		.update(players)
		.set({ portraitKey: key, portraitCheckedAt: new Date() })
		.where(eq(players.id, playerId))
	return key
}

// Players looked at and found to have no usable photo, so the backfill
// doesn't look again unless forced. Their ring shows their initials instead.
export async function markPortraitChecked(playerIds: string[]): Promise<void> {
	if (playerIds.length === 0) return
	await db
		.update(players)
		.set({ portraitCheckedAt: new Date() })
		.where(inArray(players.id, playerIds))
}

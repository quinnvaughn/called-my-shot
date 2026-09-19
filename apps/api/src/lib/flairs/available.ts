import { and, eq, isNull } from "drizzle-orm"
import { match } from "ts-pattern"
import { db } from "../../db"
import { type Flair, flairs, userFlairs } from "../../db/schema"

// The single rule for "may this person wear this". Every source that gets
// added later - a group's own flair, something bought - extends this function
// and nothing else.
//
// `groupId` is the context being equipped into: null for the site-wide slot on
// users.equippedFlairId, and a group's id once group_members.equippedFlairId
// is writable. A flair is only equippable in the context it's scoped to, which
// is what stops a group's private flair being worn across the whole site.
export async function canEquip(
	userId: string,
	flair: Flair,
	groupId: string | null = null,
): Promise<boolean> {
	if (flair.status !== "active") return false
	if (flair.scopeGroupId !== groupId) return false

	return match(flair.unlock)
		.with("open", () => Promise.resolve(true))
		.with("grant", () => hasGrant(userId, flair.id))
		.exhaustive()
}

export async function hasGrant(
	userId: string,
	flairId: string,
): Promise<boolean> {
	const row = await db.query.userFlairs.findFirst({
		where: { userId, flairId },
		columns: { flairId: true },
	})
	return row !== undefined
}

// Everything this user could equip in the site-wide slot right now: every
// open flair, plus the ones they've been granted. Two queries rather than one
// OR'd join because the halves have nothing in common - one ignores the user
// entirely and the other is entirely about them.
//
// Returns the whole set unpaginated, which is ~90 team flairs today. If that
// grows past a page worth loading, the fix is a source or league argument
// rather than a cursor: the picker filters, it doesn't scroll.
export async function availableFlairs(userId: string): Promise<Flair[]> {
	const open = await db
		.select()
		.from(flairs)
		.where(
			and(
				eq(flairs.unlock, "open"),
				eq(flairs.status, "active"),
				isNull(flairs.scopeGroupId),
			),
		)

	const granted = await db
		.select({ flair: flairs })
		.from(userFlairs)
		.innerJoin(flairs, eq(flairs.id, userFlairs.flairId))
		.where(
			and(
				eq(userFlairs.userId, userId),
				eq(flairs.status, "active"),
				isNull(flairs.scopeGroupId),
			),
		)

	// A granted flair whose unlock is "open" would appear in both halves.
	// Nothing creates that combination today, but deduping here is cheaper
	// than the picker rendering a duplicate if something ever does.
	const byId = new Map<string, Flair>()
	for (const flair of [...open, ...granted.map((row) => row.flair)]) {
		byId.set(flair.id, flair)
	}
	return [...byId.values()]
}

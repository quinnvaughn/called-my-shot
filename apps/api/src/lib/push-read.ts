import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { db } from "../db"
import { notifications } from "../db/schema"
import { collapseKeyFor, type PushKeyFields } from "./push-outbox"

const KEY_COLUMNS = {
	id: notifications.id,
	type: notifications.type,
	gameId: notifications.gameId,
	callId: notifications.callId,
	leagueId: notifications.leagueId,
	slateKey: notifications.slateKey,
	dedupeKey: notifications.dedupeKey,
}

const present = (values: (string | null)[]) => [
	...new Set(values.filter((v): v is string => v !== null)),
]

// A tapped push names the notifications it was sent for, but it also stands
// for every earlier one under the same collapse key: those folded into it or
// were replaced by it on the lock screen, and the newest is the only one the
// person ever saw. So all of them are marked read, scoped to the caller.
export async function markPushRead(
	userId: string,
	ids: string[],
	now = new Date(),
): Promise<void> {
	if (ids.length === 0) return
	const tapped: PushKeyFields[] = await db
		.select(KEY_COLUMNS)
		.from(notifications)
		.where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
	if (tapped.length === 0) return
	const keys = new Set(tapped.map(collapseKeyFor))

	// Every column a collapse key is built from, so this is a superset of the
	// rows sharing a key; collapseKeyFor below narrows it to the exact ones.
	const columns = [
		[notifications.id, present(tapped.map((n) => n.id))],
		[notifications.gameId, present(tapped.map((n) => n.gameId))],
		[notifications.callId, present(tapped.map((n) => n.callId))],
		[notifications.slateKey, present(tapped.map((n) => n.slateKey))],
		[notifications.dedupeKey, present(tapped.map((n) => n.dedupeKey))],
	] as const
	const unread = await db
		.select(KEY_COLUMNS)
		.from(notifications)
		.where(
			and(
				eq(notifications.userId, userId),
				isNull(notifications.readAt),
				or(
					...columns
						.filter(([, values]) => values.length > 0)
						.map(([column, values]) => inArray(column, values)),
				),
			),
		)
	const read = unread
		.filter((n) => keys.has(collapseKeyFor(n)))
		.map((n) => n.id)
	if (read.length === 0) return

	await db
		.update(notifications)
		.set({ readAt: now })
		.where(and(inArray(notifications.id, read), isNull(notifications.readAt)))
}

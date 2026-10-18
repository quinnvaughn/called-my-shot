import { and, count, eq, isNull } from "drizzle-orm"
import { db } from "../db"
import { redoGrants } from "../db/schema"
import type { DbOrTx, Tx } from "../db/types"
import { enqueueAnalyticsEvents } from "./analytics-outbox"

// Unspent redos. Counted live rather than denormalized onto users: the
// partial index on (user_id, created_at) where consumed_at is null holds at
// most REDO_BALANCE_CAP entries per user however many they have ever spent,
// so this is cheaper than keeping a counter honest would be - and a counter
// would be a second source of truth for the number that gates spending.
export async function redoBalanceFor(
	userId: string,
	executor: DbOrTx = db,
): Promise<number> {
	const [row] = await executor
		.select({ n: count() })
		.from(redoGrants)
		.where(and(eq(redoGrants.userId, userId), isNull(redoGrants.consumedAt)))
	return row?.n ?? 0
}

// Spend one redo, oldest first.
//
// A conditional UPDATE rather than a read-then-write: it either takes a grant
// or returns nothing, and can never take the same one twice. Returning null
// means an empty wallet, not a lost race worth retrying.
export async function consumeRedoGrant(tx: Tx, userId: string, callId: string) {
	const oldest = await tx.query.redoGrants.findFirst({
		where: { userId, consumedAt: { isNull: true } },
		orderBy: { createdAt: "asc" },
		columns: { id: true },
	})
	if (!oldest) return null

	const [consumed] = await tx
		.update(redoGrants)
		.set({ consumedAt: new Date(), consumedByCallId: callId })
		.where(and(eq(redoGrants.id, oldest.id), isNull(redoGrants.consumedAt)))
		.returning()
	return consumed ?? null
}

// Admins redo without a wallet. Their earned redos are left untouched, and
// the grant is minted already spent so the redo still has a receipt like any
// other (call_redos.grant_id is not null).
export async function consumeAdminRedo(
	tx: Tx,
	userId: string,
	callId: string,
) {
	const [grant] = await tx
		.insert(redoGrants)
		.values({
			userId,
			source: "admin",
			note: "Admin redo, no wallet",
			consumedAt: new Date(),
			consumedByCallId: callId,
		})
		.returning()
	return grant
}

// Both sides of an invite get a redo, which is what makes a link worth
// sending: the ask is "here's a free redo" rather than "do me a favour". This
// is the invitee's side, granted at signup rather than on their first call,
// because it is the reason they clicked in the first place.
//
// No capacity check: a brand new account's wallet is empty by definition.
export async function grantWelcomeRedo(
	tx: Tx,
	userId: string,
	referralId: string,
) {
	const [grant] = await tx
		.insert(redoGrants)
		.values({ userId, source: "welcome", referralId })
		.returning()

	await enqueueAnalyticsEvents(tx, [
		{
			event: "redo_granted",
			userId,
			properties: { source: "welcome", balanceAfter: 1 },
		},
	])

	return grant
}

import { eq } from "drizzle-orm"
import { db } from "../db"
import { emailOptOuts, users } from "../db/schema"

// Driven entirely by Resend's webhook (routes/webhooks.ts). None of this
// gates sending - a bounced address keeps getting queued and attempted,
// because the only thing that actually fixes it is the person changing their
// address, and the banner asking them to is what this flag is for.
//
// Matched on the address rather than a user id because that is all the
// webhook payload carries. An address is unique across users, so this can
// only ever land on the account that was mailed.
export async function recordEmailBounce(
	email: string,
	reason: string | null,
): Promise<void> {
	await db
		.update(users)
		.set({ emailBouncedAt: new Date(), emailBounceReason: reason })
		.where(eq(users.email, email))
}

// Someone marked a digest as spam. Muting everything for them is both the
// right response and the cheapest way to protect the sending domain - a
// second complaint from the same person costs far more than the email was
// worth. Deliberately not a bounce: their address works fine, they just
// don't want this.
export async function recordSpamComplaint(email: string): Promise<void> {
	const user = await db.query.users.findFirst({
		where: { email },
		columns: { id: true },
	})
	if (!user) return
	await db
		.insert(emailOptOuts)
		.values({ userId: user.id, type: "all" })
		.onConflictDoNothing({ target: [emailOptOuts.userId, emailOptOuts.type] })
}

// Called when someone confirms a new address - the old one's bounce history
// says nothing about the new one, and leaving the banner up after they did
// exactly what it asked is the one outcome that would make it useless.
export async function clearEmailBounce(userId: string): Promise<void> {
	await db
		.update(users)
		.set({ emailBouncedAt: null, emailBounceReason: null })
		.where(eq(users.id, userId))
}

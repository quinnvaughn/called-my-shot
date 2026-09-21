import { and, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import type { EmailPreferenceType } from "../db/schema"
import { emailOptOuts } from "../db/schema"

// Notification mail only. Verification and email-change notices
// (lib/email-change.ts) deliberately never consult this - those are strictly
// transactional, they're how someone proves or protects ownership of an
// inbox, and an opt-out must not be able to lock a person out of their own
// account recovery. If a future email is genuinely transactional, it belongs
// in that category too, not behind a new enum member.
export async function mutedEmailTypes(
	userId: string,
): Promise<EmailPreferenceType[]> {
	const rows = await db
		.select({ type: emailOptOuts.type })
		.from(emailOptOuts)
		.where(eq(emailOptOuts.userId, userId))
	return rows.map((r) => r.type)
}

export type Recipient = {
	email: string
	username: string
	// Whether this person muted the email type being sent, directly or through
	// "all".
	muted: boolean
}

// Who a drain is about to mail, keyed by user id, in one query per table
// rather than one per recipient. An id with no user behind it (deleted since
// its row was queued) is simply absent from the map.
//
// Read at send time rather than at enqueue so an unsubscribe during the wait
// still counts.
export async function loadRecipients(
	userIds: string[],
	type: EmailPreferenceType,
): Promise<Map<string, Recipient>> {
	const byUser = new Map<string, Recipient>()
	if (userIds.length === 0) return byUser

	const [rows, optOuts] = await Promise.all([
		db.query.users.findMany({
			where: { id: { in: userIds } },
			columns: { id: true, email: true, username: true },
		}),
		db
			.select({ userId: emailOptOuts.userId })
			.from(emailOptOuts)
			.where(
				and(
					inArray(emailOptOuts.userId, userIds),
					inArray(emailOptOuts.type, ["all", type]),
				),
			),
	])
	const muted = new Set(optOuts.map((o) => o.userId))
	for (const user of rows) {
		byUser.set(user.id, {
			email: user.email,
			username: user.username,
			muted: muted.has(user.id),
		})
	}
	return byUser
}

export async function setEmailPreference(
	userId: string,
	type: EmailPreferenceType,
	enabled: boolean,
): Promise<void> {
	if (enabled) {
		await db
			.delete(emailOptOuts)
			.where(and(eq(emailOptOuts.userId, userId), eq(emailOptOuts.type, type)))
		return
	}
	await db
		.insert(emailOptOuts)
		.values({ userId, type })
		.onConflictDoNothing({ target: [emailOptOuts.userId, emailOptOuts.type] })
}

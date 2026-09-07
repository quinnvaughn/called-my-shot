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

// Batched form for the digest drain, which resolves a page of users at once
// and would otherwise issue one query per recipient.
export async function mutedEmailTypesByUser(
	userIds: string[],
): Promise<Map<string, Set<EmailPreferenceType>>> {
	const byUser = new Map<string, Set<EmailPreferenceType>>()
	if (userIds.length === 0) return byUser

	const rows = await db
		.select({ userId: emailOptOuts.userId, type: emailOptOuts.type })
		.from(emailOptOuts)
		.where(inArray(emailOptOuts.userId, userIds))

	for (const row of rows) {
		const set = byUser.get(row.userId) ?? new Set()
		set.add(row.type)
		byUser.set(row.userId, set)
	}
	return byUser
}

export function isMuted(
	muted: Set<EmailPreferenceType> | undefined,
	type: EmailPreferenceType,
): boolean {
	if (!muted) return false
	return muted.has("all") || muted.has(type)
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

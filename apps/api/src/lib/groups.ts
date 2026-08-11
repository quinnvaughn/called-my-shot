import { randomInt } from "node:crypto"
import { eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../db"
import { groupInvites } from "../db/schema"
import { AuthorizationError, NotFoundError } from "./errors"

// Excludes 0/O and 1/I/L - easy to tell apart if someone reads or types it by hand.
const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const INVITE_CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5

function generateInviteCode() {
	let code = ""
	for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
		code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]
	}
	return code
}

function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		(err as { code?: string }).code === "23505"
	)
}

async function withRetriedCode<T>(
	attempt: (code: string) => Promise<T>,
): Promise<T> {
	for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
		try {
			return await attempt(generateInviteCode())
		} catch (err) {
			if (!isUniqueViolation(err) || i === MAX_CODE_ATTEMPTS - 1) throw err
		}
	}
	throw new Error("Could not generate a unique invite code")
}

export type InviteExpiryOption =
	| "TWENTY_FOUR_HOURS"
	| "SEVEN_DAYS"
	| "NO_EXPIRY"

export function expiryToDate(expiry: InviteExpiryOption): Date | null {
	switch (expiry) {
		case "TWENTY_FOUR_HOURS":
			return DateTime.now().plus({ hours: 24 }).toJSDate()
		case "SEVEN_DAYS":
			return DateTime.now().plus({ days: 7 }).toJSDate()
		case "NO_EXPIRY":
			return null
	}
}

export function insertGroupInvite(groupId: string, expiresAt: Date | null) {
	return withRetriedCode(async (code) => {
		const [invite] = await db
			.insert(groupInvites)
			.values({ groupId, code, expiresAt })
			.returning()
		return invite
	})
}

export async function regenerateInviteCode(groupId: string) {
	const invite = await withRetriedCode(async (code) => {
		const [updated] = await db
			.update(groupInvites)
			.set({ code })
			.where(eq(groupInvites.groupId, groupId))
			.returning()
		return updated
	})
	if (!invite) throw new NotFoundError("Group not found")
	return invite
}

export function isInviteExpired(expiresAt: Date | null): boolean {
	return expiresAt !== null && DateTime.fromJSDate(expiresAt) < DateTime.now()
}

export async function requireAdmin(groupId: string, userId: string) {
	const membership = await db.query.groupMembers.findFirst({
		where: { groupId, userId },
	})
	if (membership?.role !== "admin") {
		throw new AuthorizationError("Only group admins can do that.")
	}
	return membership
}

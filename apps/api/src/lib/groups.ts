import { randomInt } from "node:crypto"
import { eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { db } from "../db"
import { groupInvites, groupLeagues } from "../db/schema"
import { AuthorizationError, NotFoundError, ValidationError } from "./errors"
import type { Tx } from "./user-season-stats"

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

export function insertGroupInvite(
	groupId: string,
	createdBy: string,
	expiresAt: Date | null,
) {
	return withRetriedCode(async (code) => {
		const [invite] = await db
			.insert(groupInvites)
			.values({ groupId, createdBy, code, expiresAt })
			.returning()
		return invite
	})
}

// Every member gets one invite link per group - fetch theirs, creating it on
// first request so opening the invite modal always has something to show.
export async function getOrCreateMemberInvite(groupId: string, userId: string) {
	const existing = await db.query.groupInvites.findFirst({
		where: { groupId, createdBy: userId },
	})
	if (existing) return existing
	return insertGroupInvite(groupId, userId, expiryToDate("SEVEN_DAYS"))
}

export async function requireInviteOwnerOrAdmin(
	inviteId: string,
	userId: string,
) {
	const invite = await db.query.groupInvites.findFirst({
		where: { id: inviteId },
	})
	if (!invite) throw new NotFoundError("Invite not found")
	if (invite.createdBy === userId) return invite

	const membership = await db.query.groupMembers.findFirst({
		where: { groupId: invite.groupId, userId },
	})
	if (membership?.role !== "admin") {
		throw new AuthorizationError(
			"Only the link's creator or a group admin can do that.",
		)
	}
	return invite
}

export async function regenerateInviteCode(
	inviteId: string,
	expiresAt: Date | null,
) {
	const invite = await withRetriedCode(async (code) => {
		const [updated] = await db
			.update(groupInvites)
			.set({ code, expiresAt })
			.where(eq(groupInvites.id, inviteId))
			.returning()
		return updated
	})
	if (!invite) throw new NotFoundError("Invite not found")
	return invite
}

export function isInviteExpired(expiresAt: Date | null): boolean {
	return expiresAt !== null && DateTime.fromJSDate(expiresAt) < DateTime.now()
}

// null means the group tracks every league (it has no group_leagues rows),
// which is different from an empty list - callers pass this straight through
// as a league filter, where null is "no filter".
export async function getTrackedLeagueIds(
	groupId: string,
): Promise<string[] | null> {
	const rows = await db.query.groupLeagues.findMany({
		where: { groupId },
		columns: { leagueId: true },
	})
	return rows.length > 0 ? rows.map((r) => r.leagueId) : null
}

export async function requireKnownLeagueIds(leagueIds: string[]) {
	if (leagueIds.length === 0) return
	const found = await db.query.leagues.findMany({
		where: { id: { in: leagueIds } },
		columns: { id: true },
	})
	if (found.length !== leagueIds.length) {
		throw ValidationError.field("leagueIds", "Pick leagues from the list")
	}
}

// Replaces the whole set rather than diffing it - a group tracks a handful of
// leagues at most, and an empty list clears it back to every league.
export async function setTrackedLeagues(
	executor: typeof db | Tx,
	groupId: string,
	leagueIds: string[],
) {
	await executor.delete(groupLeagues).where(eq(groupLeagues.groupId, groupId))
	if (leagueIds.length === 0) return
	await executor
		.insert(groupLeagues)
		.values(leagueIds.map((leagueId) => ({ groupId, leagueId })))
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

import { eq } from "drizzle-orm"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../db"
import {
	type Group,
	groupEvents,
	groupInvites,
	groupLeagues,
	groupLinks,
	groupMembers,
	type Question,
	questionShares,
	type User,
} from "../db/schema"
import type { DbOrTx, Tx } from "../db/types"
import { AuthorizationError, NotFoundError, ValidationError } from "./errors"
import { withRetriedCode } from "./invite-codes"
import { createNotifications, type NotificationInput } from "./notifications"

export type InviteExpiryOption =
	| "TWENTY_FOUR_HOURS"
	| "SEVEN_DAYS"
	| "NO_EXPIRY"

export function expiryToDate(expiry: InviteExpiryOption): Date | null {
	return match(expiry)
		.with("TWENTY_FOUR_HOURS", () =>
			DateTime.now().plus({ hours: 24 }).toJSDate(),
		)
		.with("SEVEN_DAYS", () => DateTime.now().plus({ days: 7 }).toJSDate())
		.with("NO_EXPIRY", () => null)
		.exhaustive()
}

// Inside a caller's transaction each attempt runs in its own savepoint, so a
// code collision rolls back just that attempt rather than aborting the
// caller's whole transaction.
export function insertGroupInvite(
	groupId: string,
	createdBy: string,
	expiresAt: Date | null,
	executor: DbOrTx = db,
) {
	return withRetriedCode((code) =>
		executor.transaction(async (sp) => {
			const [invite] = await sp
				.insert(groupInvites)
				.values({ groupId, createdBy, code, expiresAt })
				.returning()
			return invite
		}),
	)
}

// Every member gets one invite link per group - fetch theirs, creating it on
// first request so opening the invite modal always has something to show. An
// expired one is swapped for a fresh code that never expires, so the invite
// modal and the group page's invite card never hand out a dead link.
export async function getOrCreateMemberInvite(groupId: string, userId: string) {
	const existing = await db.query.groupInvites.findFirst({
		where: { groupId, createdBy: userId },
	})
	if (!existing) {
		return insertGroupInvite(groupId, userId, expiryToDate("NO_EXPIRY"))
	}
	if (isInviteExpired(existing.expiresAt)) {
		return regenerateInviteCode(existing.id, expiryToDate("NO_EXPIRY"))
	}
	return existing
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
	executor: DbOrTx,
	groupId: string,
	leagueIds: string[],
) {
	await executor.delete(groupLeagues).where(eq(groupLeagues.groupId, groupId))
	if (leagueIds.length === 0) return
	await executor
		.insert(groupLeagues)
		.values(leagueIds.map((leagueId) => ({ groupId, leagueId })))
}

// Replaces the whole set, in the order given - a group shows a handful of
// links at most, and reordering would otherwise mean rewriting every
// position anyway.
export async function setGroupLinks(
	executor: DbOrTx,
	groupId: string,
	links: { url: string; label?: string }[],
) {
	await executor.delete(groupLinks).where(eq(groupLinks.groupId, groupId))
	if (links.length === 0) return
	await executor.insert(groupLinks).values(
		links.map((link, position) => ({
			groupId,
			url: link.url,
			// || rather than ??: a blank label is no label
			label: link.label || null,
			position,
		})),
	)
}

export async function requireGroupMember(groupId: string, userId: string) {
	const membership = await db.query.groupMembers.findFirst({
		where: { groupId, userId },
	})
	if (!membership) {
		throw new AuthorizationError("You're not a member of this group.")
	}
	return membership
}

export async function requireGroupAdmin(groupId: string, userId: string) {
	const membership = await db.query.groupMembers.findFirst({
		where: { groupId, userId },
	})
	if (membership?.role !== "admin") {
		throw new AuthorizationError("Only group admins can do that.")
	}
	return membership
}

// Tells everyone else in the group about something `actor` just did there.
export async function notifyOtherMembers(
	tx: Tx,
	groupId: string,
	actorId: string,
	notificationFor: (userId: string) => NotificationInput,
) {
	const others = await tx.query.groupMembers.findMany({
		where: { groupId, userId: { ne: actorId } },
		columns: { userId: true },
	})
	await createNotifications(
		tx,
		others.map((member) => notificationFor(member.userId)),
	)
}

// Adds `user` to `group` as a member and tells the rest of the group. Already
// being in it is a no-op, not an error: the conflict check and the insert are
// one statement, so two joins racing can't both notify. `invitedById` is whose
// invite link brought them in, null when they came in some other way (a
// recap link).
export async function addGroupMember(
	group: Pick<Group, "id" | "name">,
	user: Pick<User, "id" | "username">,
	invitedById: string | null,
) {
	await db.transaction(async (tx) => {
		const [joined] = await tx
			.insert(groupMembers)
			.values({
				groupId: group.id,
				userId: user.id,
				role: "member",
				invitedById,
			})
			.onConflictDoNothing()
			.returning()
		if (!joined) return
		await tx.insert(groupEvents).values({
			groupId: group.id,
			kind: "member_joined",
			actorId: user.id,
			invitedById,
		})
		await notifyOtherMembers(tx, group.id, user.id, (userId) => ({
			type: "group_member_joined",
			userId,
			groupId: group.id,
			groupName: group.name,
			actorId: user.id,
			actorUsername: user.username,
		}))
	})
	// Every member gets their own invite link, same as the creator does in
	// createGroup - myInvite should never be null for a member.
	await getOrCreateMemberInvite(group.id, user.id)
}

// A group only takes questions from the leagues it tracks - the same filter
// its feeds and leaderboard read through.
export async function assertGroupTracksLeague(
	group: Pick<Group, "id" | "name">,
	question: Pick<Question, "leagueId">,
) {
	const tracked = await getTrackedLeagueIds(group.id)
	if (!tracked || tracked.includes(question.leagueId)) return
	const league = await db.query.leagues.findFirst({
		where: { id: question.leagueId },
		columns: { abbreviation: true },
	})
	throw ValidationError.field(
		null,
		`${group.name} doesn't track ${league?.abbreviation ?? "this league's"} questions.`,
	)
}

// Puts a question in the group's Shared feed, or returns the share that's
// already there. Only a share this call actually inserted notifies anyone, so
// re-sharing stays silent and never bumps the original back to the top.
export async function shareQuestionInTx(
	tx: Tx,
	{
		group,
		question,
		user,
	}: {
		group: Pick<Group, "id" | "name">
		question: Pick<Question, "id" | "title">
		user: Pick<User, "id" | "username">
	},
) {
	const [inserted] = await tx
		.insert(questionShares)
		.values({ groupId: group.id, questionId: question.id, sharedBy: user.id })
		.onConflictDoNothing()
		.returning()
	if (!inserted) {
		const existing = await tx.query.questionShares.findFirst({
			where: { groupId: group.id, questionId: question.id },
		})
		if (!existing) {
			throw new Error("shareQuestionInTx: share vanished mid-transaction")
		}
		return existing
	}

	await notifyOtherMembers(tx, group.id, user.id, (userId) => ({
		type: "question_shared_to_group",
		userId,
		groupId: group.id,
		groupName: group.name,
		questionId: question.id,
		questionTitle: question.title,
		actorId: user.id,
		actorUsername: user.username,
	}))
	return inserted
}

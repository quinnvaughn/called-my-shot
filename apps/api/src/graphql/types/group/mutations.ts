import {
	createGroupSchema,
	joinGroupSchema,
	updateGroupLinksSchema,
	updateGroupSchema,
} from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Group,
	groupInvites,
	groupMembers,
	groups,
} from "../../../db/schema"
import type { Tx } from "../../../db/types"
import { requireUser } from "../../../lib/auth"
import { releaseLinksOnLeave } from "../../../lib/chains/mutate"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	addGroupMember,
	assertGroupTracksLeague,
	expiryToDate,
	getOrCreateMemberInvite,
	insertGroupInvite,
	isInviteExpired,
	regenerateInviteCode,
	requireGroupAdmin,
	requireGroupMember,
	requireInviteOwnerOrAdmin,
	requireKnownLeagueIds,
	setGroupLinks,
	setTrackedLeagues,
	shareQuestionInTx,
} from "../../../lib/groups"
import { deleteImage } from "../../../lib/storage"
import { builder } from "../../builder"
import { parseInput } from "../../helpers"
import { GroupRole, InviteExpiry } from "./enums"
import {
	CreateGroupInput,
	GroupPayload,
	JoinGroupInput,
	QuestionSharePayload,
	UpdateGroupInput,
	UpdateGroupLinksInput,
} from "./inputs"
import { GroupInviteRef, GroupMemberRef, GroupRef } from "./refs"

// A departed member's link would otherwise keep letting people into a group
// they're no longer part of.
function deleteMemberInvite(tx: Tx, groupId: string, userId: string) {
	return tx
		.delete(groupInvites)
		.where(
			and(
				eq(groupInvites.groupId, groupId),
				eq(groupInvites.createdBy, userId),
			),
		)
}

// Run after the group row is gone, never inside its transaction: a storage
// hiccup shouldn't be able to roll back a delete.
async function deleteGroupImages(group: Group | undefined) {
	if (!group) return
	await Promise.all([deleteImage(group.logoKey), deleteImage(group.bannerKey)])
}

builder.mutationFields((t) => ({
	createGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError],
			directResult: true,
			union: { name: "CreateGroupResult" },
		},
		args: { input: t.arg({ type: CreateGroupInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(createGroupSchema, {
				name: args.input.name,
				description: args.input.description ?? undefined,
				leagueIds: args.input.leagueIds ?? undefined,
			})
			await requireKnownLeagueIds(input.leagueIds)

			const group = await db.transaction(async (tx) => {
				const [group] = await tx
					.insert(groups)
					.values({
						name: input.name,
						// || rather than ??: a blank description is no description
						description: input.description || null,
						createdBy: user.id,
					})
					.returning()
				await tx.insert(groupMembers).values({
					groupId: group.id,
					userId: user.id,
					role: "admin",
				})
				await setTrackedLeagues(tx, group.id, input.leagueIds)
				await insertGroupInvite(
					group.id,
					user.id,
					expiryToDate("NO_EXPIRY"),
					tx,
				)
				return group
			})

			return { group }
		},
	}),

	// The admin settings form - name and tracked leagues save together, so a
	// rejected league can't leave the rename applied on its own.
	updateGroup: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateGroupResult" },
		},
		args: { input: t.arg({ type: UpdateGroupInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(updateGroupSchema, args.input)
			await requireGroupAdmin(input.groupId, user.id)
			await requireKnownLeagueIds(input.leagueIds)

			const group = await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(groups)
					.set({
						name: input.name,
						description: input.description || null,
					})
					.where(eq(groups.id, input.groupId))
					.returning()
				if (!updated) throw new NotFoundError("Group not found")
				await setTrackedLeagues(tx, updated.id, input.leagueIds)
				return updated
			})
			return { group }
		},
	}),

	// Its own mutation rather than part of updateGroup: links have their own
	// section in settings, and saving one form shouldn't resubmit the other.
	updateGroupLinks: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "UpdateGroupLinksResult" },
		},
		args: { input: t.arg({ type: UpdateGroupLinksInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const input = parseInput(updateGroupLinksSchema, {
				groupId: args.input.groupId,
				links: args.input.links.map((link) => ({
					url: link.url,
					label: link.label ?? undefined,
				})),
			})
			await requireGroupAdmin(input.groupId, user.id)

			const group = await db.transaction(async (tx) => {
				const group = await tx.query.groups.findFirst({
					where: { id: input.groupId },
				})
				if (!group) throw new NotFoundError("Group not found")
				await setGroupLinks(tx, group.id, input.links)
				return group
			})
			return { group }
		},
	}),

	joinGroupByCode: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, NotFoundError],
			directResult: true,
			union: { name: "JoinGroupResult" },
		},
		args: { input: t.arg({ type: JoinGroupInput, required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const { code } = parseInput(joinGroupSchema, args.input)

			const invite = await db.query.groupInvites.findFirst({
				where: { code },
			})
			if (!invite || isInviteExpired(invite.expiresAt)) {
				throw ValidationError.field(
					"code",
					"This invite code is invalid or has expired",
				)
			}

			const group = await db.query.groups.findFirst({
				where: { id: invite.groupId },
			})
			if (!group) throw new NotFoundError("Group not found")

			await addGroupMember(group, user, invite.createdBy)

			return { group }
		},
	}),

	removeGroupMember: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "RemoveGroupMemberResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			userId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			if (args.userId === user.id) {
				throw ValidationError.field(
					"userId",
					"You can't remove yourself from a group.",
				)
			}
			await requireGroupAdmin(args.groupId, user.id)

			await db.transaction(async (tx) => {
				const removed = await tx.query.users.findFirst({
					where: { id: String(args.userId) },
					columns: { id: true, username: true },
				})
				if (removed) await releaseLinksOnLeave(tx, removed, args.groupId)
				await tx
					.delete(groupMembers)
					.where(
						and(
							eq(groupMembers.groupId, args.groupId),
							eq(groupMembers.userId, args.userId),
						),
					)
				await deleteMemberInvite(tx, args.groupId, args.userId)
			})

			return true
		},
	}),

	// Admins are equals: any admin can promote a member or demote any admin,
	// themselves included, as long as the group keeps at least one.
	setGroupMemberRole: t.field({
		type: GroupMemberRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetGroupMemberRoleResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			userId: t.arg.id({ required: true }),
			role: t.arg({ type: GroupRole, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireGroupAdmin(args.groupId, user.id)

			return db.transaction(async (tx) => {
				// Locks the group so two admins demoting each other at once can't
				// both pass the last-admin check below.
				await tx
					.select({ id: groups.id })
					.from(groups)
					.where(eq(groups.id, args.groupId))
					.for("update")
				const members = await tx.query.groupMembers.findMany({
					where: { groupId: args.groupId },
				})
				const target = members.find((m) => m.userId === args.userId)
				if (!target) {
					throw new NotFoundError("They're not a member of this group.")
				}
				if (target.role === args.role) return target

				const adminCount = members.filter((m) => m.role === "admin").length
				if (args.role === "member" && adminCount === 1) {
					throw ValidationError.field(
						null,
						"A group needs at least one admin. Make someone else an admin first.",
					)
				}

				const [updated] = await tx
					.update(groupMembers)
					.set({ role: args.role })
					.where(eq(groupMembers.id, target.id))
					.returning()
				return updated
			})
		},
	}),

	deleteGroup: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			union: { name: "DeleteGroupResult" },
		},
		args: { groupId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireGroupAdmin(args.groupId, user.id)
			const [deleted] = await db
				.delete(groups)
				.where(eq(groups.id, args.groupId))
				.returning()
			await deleteGroupImages(deleted)
			return true
		},
	}),

	leaveGroup: t.field({
		type: "Boolean",
		errors: {
			types: [AuthenticationError, NotFoundError],
			union: { name: "LeaveGroupResult" },
		},
		args: { groupId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)

			const members = await db.query.groupMembers.findMany({
				where: { groupId: args.groupId },
				orderBy: { joinedAt: "asc" },
			})
			const actorMembership = members.find((m) => m.userId === user.id)
			if (!actorMembership) {
				throw new NotFoundError("You're not a member of this group.")
			}
			const others = members.filter((m) => m.userId !== user.id)

			const deletedGroup = await db.transaction(async (tx) => {
				// The last admin can't just vanish - hand the group to whoever's
				// been there longest so it doesn't end up unmanageable.
				if (
					actorMembership.role === "admin" &&
					others.length > 0 &&
					!others.some((m) => m.role === "admin")
				) {
					await tx
						.update(groupMembers)
						.set({ role: "admin" })
						.where(eq(groupMembers.id, others[0].id))
				}

				await releaseLinksOnLeave(tx, user, args.groupId)
				await tx
					.delete(groupMembers)
					.where(eq(groupMembers.id, actorMembership.id))
				await deleteMemberInvite(tx, args.groupId, user.id)

				if (others.length === 0) {
					const [deleted] = await tx
						.delete(groups)
						.where(eq(groups.id, args.groupId))
						.returning()
					return deleted
				}
				return undefined
			})
			await deleteGroupImages(deletedGroup)

			return true
		},
	}),

	createGroupInvite: t.field({
		type: GroupInviteRef,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "CreateGroupInviteResult" },
		},
		args: { groupId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireGroupMember(args.groupId, user.id)
			return getOrCreateMemberInvite(args.groupId, user.id)
		},
	}),

	dismissGroupInviteCard: t.field({
		type: GroupRef,
		deprecationReason: "The invite card is gone.",
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "DismissGroupInviteCardResult" },
		},
		args: { groupId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireGroupMember(args.groupId, user.id)
			const group = await db.query.groups.findFirst({
				where: { id: args.groupId },
			})
			if (!group) {
				throw new Error("dismissGroupInviteCard: group vanished mid-request")
			}
			return group
		},
	}),

	resetGroupInviteCode: t.field({
		type: GroupInviteRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "ResetGroupInviteCodeResult" },
		},
		args: {
			inviteId: t.arg.id({ required: true }),
			expiry: t.arg({ type: InviteExpiry, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireInviteOwnerOrAdmin(args.inviteId, user.id)

			return regenerateInviteCode(args.inviteId, expiryToDate(args.expiry))
		},
	}),

	// Idempotent - sharing a question that's already in the group's feed just
	// returns the existing share rather than erroring or bumping its position.
	shareQuestionToGroup: t.field({
		type: QuestionSharePayload,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "ShareQuestionToGroupResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			questionId: t.arg.id({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireGroupMember(args.groupId, user.id)
			const group = await db.query.groups.findFirst({
				where: { id: args.groupId },
			})
			if (!group) throw new NotFoundError("Group not found")

			const question = await db.query.questions.findFirst({
				where: { id: args.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			await assertGroupTracksLeague(group, question)

			const share = await db.transaction((tx) =>
				shareQuestionInTx(tx, { group, question, user }),
			)
			return { share }
		},
	}),
}))

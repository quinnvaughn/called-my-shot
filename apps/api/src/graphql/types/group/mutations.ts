import {
	createGroupSchema,
	joinGroupSchema,
	updateGroupSchema,
} from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { db } from "../../../db"
import { groupMembers, groups, questionShares } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../../lib/errors"
import {
	expiryToDate,
	getOrCreateMemberInvite,
	getTrackedLeagueIds,
	insertGroupInvite,
	isInviteExpired,
	regenerateInviteCode,
	requireAdmin,
	requireInviteOwnerOrAdmin,
	requireKnownLeagueIds,
	setTrackedLeagues,
} from "../../../lib/groups"
import { createNotifications } from "../../../lib/notifications"
import { builder } from "../../builder"
import { InviteExpiry } from "./enums"
import {
	CreateGroupInput,
	GroupPayload,
	JoinGroupInput,
	QuestionSharePayload,
	UpdateGroupInput,
} from "./inputs"
import { GroupInviteRef } from "./refs"

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
			const parsed = createGroupSchema.safeParse({
				name: args.input.name,
				description: args.input.description ?? undefined,
				leagueIds: args.input.leagueIds ?? undefined,
			})
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			await requireKnownLeagueIds(parsed.data.leagueIds)

			const [group] = await db
				.insert(groups)
				.values({
					name: parsed.data.name,
					// || rather than ??: a blank description is no description
					description: parsed.data.description || null,
					createdBy: user.id,
				})
				.returning()
			await db
				.insert(groupMembers)
				.values({ groupId: group.id, userId: user.id, role: "admin" })
			await setTrackedLeagues(db, group.id, parsed.data.leagueIds)
			await insertGroupInvite(group.id, user.id, expiryToDate("NO_EXPIRY"))

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
			const parsed = updateGroupSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}
			await requireAdmin(parsed.data.groupId, user.id)
			await requireKnownLeagueIds(parsed.data.leagueIds)

			const group = await db.transaction(async (tx) => {
				const [updated] = await tx
					.update(groups)
					.set({
						name: parsed.data.name,
						description: parsed.data.description || null,
					})
					.where(eq(groups.id, parsed.data.groupId))
					.returning()
				if (!updated) throw new NotFoundError("Group not found")
				await setTrackedLeagues(tx, updated.id, parsed.data.leagueIds)
				return updated
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
			const parsed = joinGroupSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}

			const invite = await db.query.groupInvites.findFirst({
				where: { code: parsed.data.code },
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

			const existing = await db.query.groupMembers.findFirst({
				where: { groupId: invite.groupId, userId: user.id },
			})
			if (!existing) {
				await db.transaction(async (tx) => {
					await tx.insert(groupMembers).values({
						groupId: invite.groupId,
						userId: user.id,
						role: "member",
					})

					const otherMembers = await tx.query.groupMembers.findMany({
						where: { groupId: invite.groupId, userId: { ne: user.id } },
						columns: { userId: true },
					})
					await createNotifications(
						tx,
						otherMembers.map((m) => ({
							type: "group_member_joined" as const,
							userId: m.userId,
							groupId: group.id,
							groupName: group.name,
							actorId: user.id,
							actorUsername: user.username,
						})),
					)
				})
			}
			// every member gets their own invite link, same as the creator does in
			// createGroup - myInvite should never be null for a member
			await getOrCreateMemberInvite(invite.groupId, user.id)

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
			await requireAdmin(args.groupId, user.id)

			await db
				.delete(groupMembers)
				.where(
					and(
						eq(groupMembers.groupId, args.groupId),
						eq(groupMembers.userId, args.userId),
					),
				)

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

			await db.transaction(async (tx) => {
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

				await tx
					.delete(groupMembers)
					.where(eq(groupMembers.id, actorMembership.id))

				if (others.length === 0) {
					await tx.delete(groups).where(eq(groups.id, args.groupId))
				}
			})

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
			const membership = await db.query.groupMembers.findFirst({
				where: { groupId: args.groupId, userId: user.id },
			})
			if (!membership) {
				throw new AuthorizationError("You're not a member of this group.")
			}
			return getOrCreateMemberInvite(args.groupId, user.id)
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
			const membership = await db.query.groupMembers.findFirst({
				where: { groupId: args.groupId, userId: user.id },
				with: { group: true },
			})
			if (!membership) {
				throw new AuthorizationError("You're not a member of this group.")
			}
			if (!membership.group) throw new NotFoundError("Group not found")
			const group = membership.group

			const question = await db.query.questions.findFirst({
				where: { id: args.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			const tracked = await getTrackedLeagueIds(args.groupId)
			if (tracked && !tracked.includes(question.leagueId)) {
				const league = await db.query.leagues.findFirst({
					where: { id: question.leagueId },
					columns: { abbreviation: true },
				})
				throw ValidationError.field(
					null,
					`${group.name} doesn't track ${league?.abbreviation ?? "this league's"} questions.`,
				)
			}

			const existing = await db.query.questionShares.findFirst({
				where: { groupId: args.groupId, questionId: args.questionId },
			})
			if (existing) return { share: existing }

			const share = await db.transaction(async (tx) => {
				const [share] = await tx
					.insert(questionShares)
					.values({
						groupId: args.groupId,
						questionId: args.questionId,
						sharedBy: user.id,
					})
					.returning()

				const otherMembers = await tx.query.groupMembers.findMany({
					where: { groupId: args.groupId, userId: { ne: user.id } },
					columns: { userId: true },
				})
				await createNotifications(
					tx,
					otherMembers.map((m) => ({
						type: "question_shared_to_group" as const,
						userId: m.userId,
						groupId: args.groupId,
						groupName: group.name,
						questionId: question.id,
						questionTitle: question.title,
						actorId: user.id,
						actorUsername: user.username,
					})),
				)

				return share
			})
			return { share }
		},
	}),
}))

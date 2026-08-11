import { createGroupSchema, joinGroupSchema } from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { groupInvites, groupMembers, groups, type users } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import {
	expiryToDate,
	insertGroupInvite,
	isInviteExpired,
	regenerateInviteCode,
	requireAdmin,
} from "../../lib/groups"
import { builder } from "../builder"
import { UserRef } from "./user"

const GroupRole = builder.enumType("GroupRole", {
	values: {
		ADMIN: { value: "admin" },
		MEMBER: { value: "member" },
	},
})

const InviteExpiry = builder.enumType("InviteExpiry", {
	values: ["TWENTY_FOUR_HOURS", "SEVEN_DAYS", "NO_EXPIRY"] as const,
})

const GroupInviteRef = builder.drizzleObject("groupInvites", {
	name: "GroupInvite",
	fields: (t) => ({
		code: t.exposeString("code"),
		expiresAt: t.field({
			type: "String",
			nullable: true,
			resolve: (invite) => invite.expiresAt?.toISOString() ?? null,
		}),
	}),
})

export const GroupMemberRef = builder.drizzleObject("groupMembers", {
	name: "GroupMember",
	fields: (t) => ({
		id: t.exposeID("id"),
		role: t.field({ type: GroupRole, resolve: (member) => member.role }),
		joinedAt: t.field({
			type: "String",
			resolve: (member) => member.joinedAt.toISOString(),
		}),
		user: t.relation("user"),
	}),
})

type LeaderboardEntry = {
	rank: number
	user: typeof users.$inferSelect
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
}

const GroupLeaderboardEntryRef = builder
	.objectRef<LeaderboardEntry>("GroupLeaderboardEntry")
	.implement({
		fields: (t) => ({
			rank: t.exposeInt("rank"),
			totalPoints: t.exposeInt("totalPoints"),
			// % of this member's resolved picks that hit - null until they have any
			accuracy: t.exposeFloat("accuracy", { nullable: true }),
			callCount: t.exposeInt("callCount"),
			resolvedCallCount: t.exposeInt("resolvedCallCount"),
			user: t.field({ type: UserRef, resolve: (entry) => entry.user }),
		}),
	})

async function buildLeaderboard(groupId: string): Promise<LeaderboardEntry[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		with: { user: true },
	})

	const memberCalls = await db.query.calls.findMany({
		where: { userId: { in: memberships.map((m) => m.userId) } },
		with: { selections: { with: { option: true } } },
	})

	const callsByUser = new Map<string, typeof memberCalls>()
	for (const call of memberCalls) {
		const existing = callsByUser.get(call.userId)
		if (existing) existing.push(call)
		else callsByUser.set(call.userId, [call])
	}

	const entries = memberships.flatMap((membership) => {
		if (!membership.user) return []
		const calls = callsByUser.get(membership.userId) ?? []
		let totalPoints = 0
		let resolvedCallCount = 0
		let correctCount = 0

		for (const call of calls) {
			if (call.selections.length > 0) {
				for (const selection of call.selections) {
					if (selection.resultPoints === null) continue
					resolvedCallCount++
					totalPoints += selection.resultPoints
					if (selection.option?.isCorrect) correctCount++
				}
			} else if (call.resultPoints !== null) {
				resolvedCallCount++
				totalPoints += call.resultPoints
				if (call.hitTolerance) correctCount++
			}
		}

		return [
			{
				user: membership.user,
				totalPoints,
				accuracy:
					resolvedCallCount > 0
						? (correctCount / resolvedCallCount) * 100
						: null,
				callCount: calls.length,
				resolvedCallCount,
			},
		]
	})

	entries.sort((a, b) => b.totalPoints - a.totalPoints)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
}

const GroupRef = builder.drizzleObject("groups", {
	name: "Group",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		createdAt: t.field({
			type: "String",
			resolve: (group) => group.createdAt.toISOString(),
		}),
		memberCount: t.relatedCount("members"),
		members: t.relation("members"),
		invite: t.relation("invite"),
		viewerIsAdmin: t.field({
			type: "Boolean",
			resolve: async (group, _args, ctx) => {
				if (!ctx.user) return false
				const membership = await db.query.groupMembers.findFirst({
					where: { groupId: group.id, userId: ctx.user.id },
				})
				return membership?.role === "admin"
			},
		}),
		// ranked by total points across every call a member has made, not just
		// calls on questions created within this group - a group is just a set
		// of people, there's no group-scoped question pool
		leaderboard: t.field({
			type: [GroupLeaderboardEntryRef],
			resolve: (group) => buildLeaderboard(group.id),
		}),
		// convenience for group cards ("YOU'RE #2") that don't need the full list
		viewerRank: t.field({
			type: "Int",
			resolve: async (group, _args, ctx) => {
				const user = requireUser(ctx)
				const leaderboard = await buildLeaderboard(group.id)
				const entry = leaderboard.find((e) => e.user.id === user.id)
				// group/myGroups already gate on the viewer being a member, so this
				// should always be found
				if (!entry)
					throw new NotFoundError("You're not a member of this group.")
				return entry.rank
			},
		}),
	}),
})

const GroupPreviewRef = builder
	.objectRef<{ id: string; name: string; memberCount: number }>("GroupPreview")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			memberCount: t.exposeInt("memberCount"),
		}),
	})

const GroupPayload = builder
	.objectRef<{ group: typeof groups.$inferSelect }>("GroupPayload")
	.implement({
		fields: (t) => ({
			group: t.field({ type: GroupRef, resolve: (payload) => payload.group }),
		}),
	})

const CreateGroupInput = builder.inputType("CreateGroupInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
	}),
})

const JoinGroupInput = builder.inputType("JoinGroupInput", {
	fields: (t) => ({
		code: t.string({ required: true }),
	}),
})

builder.queryFields((t) => ({
	myGroups: t.field({
		type: [GroupRef],
		resolve: async (_root, _args, ctx) => {
			if (!ctx.user) return []
			const memberships = await db.query.groupMembers.findMany({
				where: { userId: ctx.user.id },
				with: { group: true },
			})
			return memberships
				.map((membership) => membership.group)
				.filter((group) => group !== null)
		},
	}),

	group: t.field({
		type: GroupRef,
		nullable: true,
		args: { id: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			if (!ctx.user) return null
			const membership = await db.query.groupMembers.findFirst({
				where: { groupId: args.id, userId: ctx.user.id },
			})
			if (!membership) return null
			return db.query.groups.findFirst({ where: { id: args.id } })
		},
	}),

	groupPreview: t.field({
		type: GroupPreviewRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: async (_root, args) => {
			const code = args.code.trim().toUpperCase()
			const invite = await db.query.groupInvites.findFirst({ where: { code } })
			if (!invite || isInviteExpired(invite.expiresAt)) return null

			const group = await db.query.groups.findFirst({
				where: { id: invite.groupId },
			})
			if (!group) return null

			const members = await db.query.groupMembers.findMany({
				where: { groupId: group.id },
				columns: { id: true },
			})

			return { id: group.id, name: group.name, memberCount: members.length }
		},
	}),
}))

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
			const parsed = createGroupSchema.safeParse(args.input)
			if (!parsed.success) {
				throw ValidationError.fromZodIssues(parsed.error.issues)
			}

			const [group] = await db
				.insert(groups)
				.values({ name: parsed.data.name, createdBy: user.id })
				.returning()
			await db
				.insert(groupMembers)
				.values({ groupId: group.id, userId: user.id, role: "admin" })
			await insertGroupInvite(group.id, expiryToDate("SEVEN_DAYS"))

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

			const existing = await db.query.groupMembers.findFirst({
				where: { groupId: invite.groupId, userId: user.id },
			})
			if (!existing) {
				await db
					.insert(groupMembers)
					.values({ groupId: invite.groupId, userId: user.id, role: "member" })
			}

			const group = await db.query.groups.findFirst({
				where: { id: invite.groupId },
			})
			if (!group) throw new NotFoundError("Group not found")

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

	setGroupInviteExpiry: t.field({
		type: GroupInviteRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "SetGroupInviteExpiryResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			expiry: t.arg({ type: InviteExpiry, required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireAdmin(args.groupId, user.id)

			const [invite] = await db
				.update(groupInvites)
				.set({ expiresAt: expiryToDate(args.expiry) })
				.where(eq(groupInvites.groupId, args.groupId))
				.returning()
			if (!invite) throw new NotFoundError("Group not found")

			return invite
		},
	}),

	resetGroupInviteCode: t.field({
		type: GroupInviteRef,
		errors: {
			types: [AuthenticationError, AuthorizationError, NotFoundError],
			directResult: true,
			union: { name: "ResetGroupInviteCodeResult" },
		},
		args: { groupId: t.arg.id({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			await requireAdmin(args.groupId, user.id)

			return regenerateInviteCode(args.groupId)
		},
	}),
}))

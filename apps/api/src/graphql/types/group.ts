import { createGroupSchema, joinGroupSchema } from "@called-my-shot/schemas"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import {
	type Group,
	groupMembers,
	groups,
	type QuestionShare,
	questionShares,
	type User,
} from "../../db/schema"
import { requireUser } from "../../lib/auth"
import {
	AuthenticationError,
	AuthorizationError,
	NotFoundError,
	ValidationError,
} from "../../lib/errors"
import {
	expiryToDate,
	getOrCreateMemberInvite,
	insertGroupInvite,
	isInviteExpired,
	regenerateInviteCode,
	requireAdmin,
	requireInviteOwnerOrAdmin,
} from "../../lib/groups"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	decodeOffsetCursor,
	encodeOffsetCursor,
	paginate,
} from "../../lib/pagination"
import { aggregatePointsByUser } from "../../lib/points-aggregate"
import { accuracyFrom, compareRankableEntries } from "../../lib/scoring"
import { isUuid } from "../../lib/uuid"
import { builder } from "../builder"
import { PageInfoRef } from "./pagination"
import { CallConnectionRef, QuestionConnectionRef } from "./question"
import { UserRef } from "./user"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

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
		id: t.exposeID("id"),
		code: t.exposeString("code"),
		expiresAt: t.field({
			type: "String",
			nullable: true,
			resolve: (invite) => invite.expiresAt?.toISOString() ?? null,
		}),
		creator: t.relation("creator"),
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
	user: User
	totalPoints: number
	accuracy: number | null
	callCount: number
	resolvedCallCount: number
	role: "admin" | "member"
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
			role: t.field({ type: GroupRole, resolve: (entry) => entry.role }),
			user: t.field({ type: UserRef, resolve: (entry) => entry.user }),
		}),
	})

const GroupLeaderboardConnectionRef = builder
	.objectRef<Connection<LeaderboardEntry>>("GroupLeaderboardConnection")
	.implement({
		fields: (t) => ({
			items: t.field({
				type: [GroupLeaderboardEntryRef],
				resolve: (c) => c.items,
			}),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

// leagueId narrows the ranking to calls made on questions in that league only
// (points/accuracy recomputed from scratch, not a filter over the
// all-league numbers) - null/undefined ranks across every league, same as
// before this param existed. Scoped to league, not sport - NBA and NCAAB
// calls shouldn't rank against each other even though both are basketball.
//
// Points/accuracy/counts come from an indexed SQL GROUP BY
// (aggregatePointsByUser), scoped to just this group's member ids, instead
// of fetching every member's call/selection rows into JS - unlike the site
// leaderboard, a group is small enough that this alone is plenty fast
// without also reading the denormalized users.points column.
async function buildLeaderboard(
	groupId: string,
	leagueId?: string | null,
): Promise<LeaderboardEntry[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		with: { user: true },
	})
	const memberIds = memberships.flatMap((m) => (m.user ? [m.userId] : []))
	const agg = await aggregatePointsByUser({ userIds: memberIds, leagueId })

	const entries = memberships.flatMap((membership) => {
		if (!membership.user) return []
		const summary = agg.get(membership.userId)

		return [
			{
				user: membership.user,
				totalPoints: summary?.totalPoints ?? 0,
				accuracy: summary ? accuracyFrom(summary) : null,
				callCount: summary?.callCount ?? 0,
				resolvedCallCount: summary?.resolvedCallCount ?? 0,
				role: membership.role,
			},
		]
	})

	entries.sort(compareRankableEntries)
	return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
}

// Cheaper than buildLeaderboard for callers that only need the #1 name and
// point total (e.g. the invite preview teaser) - no accuracy join, no full
// sort, just a single pass to find the max over one scoped aggregate query.
async function findTopScorer(
	memberUsers: User[],
): Promise<{ user: User; totalPoints: number }> {
	// A group can't structurally have zero members - creation seeds the
	// creator as a member, and leaveGroup deletes the group once the last
	// member leaves. Callers should only ever pass the members of a group
	// that exists.
	if (memberUsers.length === 0) {
		throw new Error("findTopScorer called with no members")
	}

	const agg = await aggregatePointsByUser({
		userIds: memberUsers.map((u) => u.id),
	})

	// iterate memberUsers (not the aggregate map) so a member who hasn't
	// called anything is still tied for the top spot, not absent from it, and
	// ties break toward whoever comes first in that same order.
	let top: { user: User; totalPoints: number } | null = null
	for (const user of memberUsers) {
		const totalPoints = agg.get(user.id)?.totalPoints ?? 0
		if (top && totalPoints <= top.totalPoints) continue
		top = { user, totalPoints }
	}
	if (!top)
		throw new Error("findTopScorer found no top scorer despite having members")
	return top
}

async function getMemberUserIds(groupId: string): Promise<string[]> {
	const memberships = await db.query.groupMembers.findMany({
		where: { groupId },
		columns: { userId: true },
	})
	return memberships.map((m) => m.userId)
}

export const QuestionShareRef = builder.drizzleObject("questionShares", {
	name: "QuestionShare",
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({
			type: "String",
			resolve: (share) => share.createdAt.toISOString(),
		}),
		question: t.relation("question"),
		sharedBy: t.relation("sharedByUser"),
	}),
})

const QuestionShareConnectionRef = builder
	.objectRef<Connection<QuestionShare>>("QuestionShareConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [QuestionShareRef], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

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
		// the viewer's own invite link - every member gets one the moment they
		// join (see createGroup / joinGroupByCode), so this should always exist
		myInvite: t.field({
			type: GroupInviteRef,
			resolve: (group, _args, ctx) => {
				const user = requireUser(ctx)
				return getOrCreateMemberInvite(group.id, user.id)
			},
		}),
		// every member's invite link - admins only, for a "manage invites" view
		invites: t.field({
			type: [GroupInviteRef],
			resolve: async (group, _args, ctx) => {
				if (!ctx.user) return []
				const membership = await db.query.groupMembers.findFirst({
					where: { groupId: group.id, userId: ctx.user.id },
				})
				if (membership?.role !== "admin") return []
				return db.query.groupInvites.findMany({ where: { groupId: group.id } })
			},
		}),
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
		// of people, there's no group-scoped question pool. Paginated (button-
		// driven "show more" on the frontend, not infinite scroll - most groups
		// are small, nobody needs the whole roster by default) and optionally
		// scoped to one league via leagueId; omitting it ranks across every
		// league. League, not sport, since e.g. NBA and NCAAB calls shouldn't
		// rank against each other despite both being basketball.
		leaderboard: t.field({
			type: GroupLeaderboardConnectionRef,
			args: {
				first: t.arg.int(),
				after: t.arg.string(),
				leagueId: t.arg.id(),
			},
			resolve: async (group, args) => {
				const entries = await buildLeaderboard(group.id, args.leagueId)
				const limit = clampPageSize(args.first)
				const afterRank = args.after ? decodeOffsetCursor(args.after) : 0
				const items = entries.slice(afterRank, afterRank + limit)
				const hasNextPage = afterRank + limit < entries.length
				return {
					items,
					pageInfo: {
						hasNextPage,
						endCursor:
							items.length > 0
								? encodeOffsetCursor(afterRank + items.length)
								: null,
					},
				}
			},
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
		// the viewer's full leaderboard row (rank + points/accuracy), for the
		// pinned "your rank" summary above the leaderboard table - viewerRank
		// above only exposes the rank int, which isn't enough for that card.
		// leagueId keeps it in sync with whichever league tab is selected.
		viewerLeaderboardEntry: t.field({
			type: GroupLeaderboardEntryRef,
			nullable: true,
			args: { leagueId: t.arg.id() },
			resolve: async (group, args, ctx) => {
				const user = requireUser(ctx)
				const leaderboard = await buildLeaderboard(group.id, args.leagueId)
				// group/myGroups already gate on the viewer being a member, so this
				// should always be found
				return leaderboard.find((e) => e.user.id === user.id) ?? null
			},
		}),
		// Calls made by other members of this group - the "Answered" tab.
		// Group-wide (a group is just a set of people, there's no group-scoped
		// question pool), but excludes the viewer's own calls: the point of this
		// tab is surfacing what your groupmates did, not restating your own
		// history back to you (that's "My Calls").
		answeredQuestions: t.field({
			type: CallConnectionRef,
			args: {
				first: t.arg.int(),
				after: t.arg.string(),
			},
			resolve: async (group, args, ctx) => {
				const user = requireUser(ctx)
				const memberIds = await getMemberUserIds(group.id)
				const otherMemberIds = memberIds.filter((id) => id !== user.id)
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.calls.findMany({
					where: {
						userId: { in: otherMemberIds },
						...(cursor ? cursorWhere(cursor) : {}),
					},
					orderBy: { createdAt: "desc", id: "desc" },
					limit: limit + 1,
				})
				return paginate(rows, limit)
			},
		}),
		// Public questions created by other members of this group - the
		// "Created" tab. Not group-scoped content of its own (a group is just a
		// set of people, same as leaderboard above); excludes the viewer's own
		// questions for the same reason as answeredQuestions above.
		createdQuestions: t.field({
			type: QuestionConnectionRef,
			args: {
				first: t.arg.int(),
				after: t.arg.string(),
			},
			resolve: async (group, args, ctx) => {
				const user = requireUser(ctx)
				const memberIds = await getMemberUserIds(group.id)
				const otherMemberIds = memberIds.filter((id) => id !== user.id)
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.questions.findMany({
					where: {
						creatorId: { in: otherMemberIds },
						...(cursor ? cursorWhere(cursor) : {}),
					},
					orderBy: { createdAt: "desc", id: "desc" },
					limit: limit + 1,
				})
				return paginate(rows, limit)
			},
		}),
		// Public questions another member explicitly pushed into the group's
		// feed via shareQuestionToGroup - the "Shared" tab. Independent of who
		// created the question; sharedBy on each row is who sent it. Excludes
		// the viewer's own shares for the same reason as the two tabs above.
		sharedQuestions: t.field({
			type: QuestionShareConnectionRef,
			args: {
				first: t.arg.int(),
				after: t.arg.string(),
			},
			resolve: async (group, args, ctx) => {
				const user = requireUser(ctx)
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.questionShares.findMany({
					where: {
						groupId: group.id,
						sharedBy: { ne: user.id },
						...(cursor ? cursorWhere(cursor) : {}),
					},
					orderBy: { createdAt: "desc", id: "desc" },
					limit: limit + 1,
				})
				return paginate(rows, limit)
			},
		}),
	}),
})

const GROUP_PREVIEW_MEMBER_LIMIT = 5

const GroupPreviewMemberRef = builder
	.objectRef<{ id: string; name: string }>("GroupPreviewMember")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
		}),
	})

const GroupPreviewInvitedByRef = builder
	.objectRef<{ name: string; username: string }>("GroupPreviewInvitedBy")
	.implement({
		fields: (t) => ({
			name: t.exposeString("name"),
			username: t.exposeString("username"),
		}),
	})

const GroupPreviewTopScorerRef = builder
	.objectRef<{ name: string; username: string; points: number }>(
		"GroupPreviewTopScorer",
	)
	.implement({
		fields: (t) => ({
			name: t.exposeString("name"),
			username: t.exposeString("username"),
			points: t.exposeInt("points"),
		}),
	})

const GroupPreviewRef = builder
	.objectRef<{
		id: string
		name: string
		memberCount: number
		members: { id: string; name: string }[]
		invitedBy: { name: string; username: string }
		topScorer: { name: string; username: string; points: number }
	}>("GroupPreview")
	.implement({
		fields: (t) => ({
			id: t.exposeID("id"),
			name: t.exposeString("name"),
			memberCount: t.exposeInt("memberCount"),
			// capped preview for an avatar stack - not the full roster, this is
			// visible to unauthenticated visitors
			members: t.field({
				type: [GroupPreviewMemberRef],
				resolve: (preview) => preview.members,
			}),
			invitedBy: t.field({
				type: GroupPreviewInvitedByRef,
				resolve: (preview) => preview.invitedBy,
			}),
			// ranked by total points across every sport a member has called, same
			// as the real leaderboard - there's no "season" here, just points
			topScorer: t.field({
				type: GroupPreviewTopScorerRef,
				resolve: (preview) => preview.topScorer,
			}),
		}),
	})

const GroupPayload = builder
	.objectRef<{ group: Group }>("GroupPayload")
	.implement({
		fields: (t) => ({
			group: t.field({ type: GroupRef, resolve: (payload) => payload.group }),
		}),
	})

const QuestionSharePayload = builder
	.objectRef<{ share: QuestionShare }>("QuestionSharePayload")
	.implement({
		fields: (t) => ({
			share: t.field({
				type: QuestionShareRef,
				resolve: (payload) => payload.share,
			}),
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
			if (!ctx.user || !isUuid(args.id)) return null
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
			const invite = await db.query.groupInvites.findFirst({
				where: { code },
				with: { creator: true },
			})
			if (!invite || isInviteExpired(invite.expiresAt)) return null

			const group = await db.query.groups.findFirst({
				where: { id: invite.groupId },
			})
			if (!group) return null

			const members = await db.query.groupMembers.findMany({
				where: { groupId: group.id },
				with: { user: true },
			})
			const memberUsers = members.flatMap((m) => (m.user ? [m.user] : []))
			const topScorer = await findTopScorer(memberUsers)

			return {
				id: group.id,
				name: group.name,
				memberCount: memberUsers.length,
				members: memberUsers
					.slice(0, GROUP_PREVIEW_MEMBER_LIMIT)
					.map((u) => ({ id: u.id, name: u.name })),
				invitedBy: invite.creator
					? { name: invite.creator.name, username: invite.creator.username }
					: { name: "a member", username: "" },
				topScorer: {
					name: topScorer.user.name,
					username: topScorer.user.username,
					points: topScorer.totalPoints,
				},
			}
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
			await insertGroupInvite(group.id, user.id, expiryToDate("SEVEN_DAYS"))

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
			// every member gets their own invite link, same as the creator does in
			// createGroup - myInvite should never be null for a member
			await getOrCreateMemberInvite(invite.groupId, user.id)

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
			})
			if (!membership) {
				throw new AuthorizationError("You're not a member of this group.")
			}

			const question = await db.query.questions.findFirst({
				where: { id: args.questionId },
			})
			if (!question) throw new NotFoundError("Question not found")

			const existing = await db.query.questionShares.findFirst({
				where: { groupId: args.groupId, questionId: args.questionId },
			})
			if (existing) return { share: existing }

			const [share] = await db
				.insert(questionShares)
				.values({
					groupId: args.groupId,
					questionId: args.questionId,
					sharedBy: user.id,
				})
				.returning()
			return { share }
		},
	}),
}))

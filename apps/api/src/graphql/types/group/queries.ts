import { db } from "../../../db"
import { requireAdmin } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import { isInviteExpired } from "../../../lib/groups"
import { imageUrl } from "../../../lib/storage"
import { isUuid } from "../../../lib/uuid"
import { builder } from "../../builder"
import { getGroupLeaderboard, viewerMembership } from "./leaderboard"
import { GROUP_PREVIEW_MEMBER_LIMIT, GroupPreviewRef } from "./preview"
import { GroupRef } from "./refs"

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
			// Site admins can open any group read-only, member or not.
			if (!ctx.user.isAdmin && !(await viewerMembership(ctx, args.id)))
				return null
			return db.query.groups.findFirst({ where: { id: args.id } })
		},
	}),

	// Groups tab - every group on the site, newest first, so an admin can
	// open one they aren't in (the group query lets them).
	adminGroups: t.field({
		type: [GroupRef],
		errors: { types: [AuthenticationError, AuthorizationError] },
		args: { search: t.arg.string({ required: false }) },
		resolve: (_root, args, ctx) => {
			requireAdmin(ctx)
			const search = args.search?.trim()
			return db.query.groups.findMany({
				where: search ? { name: { ilike: `%${search}%` } } : undefined,
				orderBy: { createdAt: "desc" },
			})
		},
	}),

	groupPreview: t.field({
		type: GroupPreviewRef,
		nullable: true,
		args: { code: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
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

			const [members, trackedLeagues, leaderboard] = await Promise.all([
				db.query.groupMembers.findMany({
					where: { groupId: group.id },
					with: { user: true },
				}),
				db.query.groupLeagues.findMany({
					where: { groupId: group.id },
					with: { league: true },
				}),
				// The board a joiner lands on after accepting - the group page
				// defaults to the current season too.
				getGroupLeaderboard(ctx, group.id, null, { scope: "CURRENT" }),
			])
			const memberUsers = members.flatMap((m) => (m.user ? [m.user] : []))
			const leader = leaderboard[0]

			return {
				id: group.id,
				name: group.name,
				description: group.description,
				logoUrl: imageUrl(group.logoKey),
				bannerUrl: imageUrl(group.bannerKey),
				memberCount: memberUsers.length,
				members: memberUsers.slice(0, GROUP_PREVIEW_MEMBER_LIMIT).map((u) => ({
					id: u.id,
					name: u.name,
					avatarUrl: imageUrl(u.avatarKey),
				})),
				invitedBy: invite.creator
					? {
							name: invite.creator.name,
							username: invite.creator.username,
							avatarUrl: imageUrl(invite.creator.avatarKey),
						}
					: { name: "a member", username: "", avatarUrl: null },
				trackedLeagues: trackedLeagues.flatMap((row) =>
					row.league ? [{ abbreviation: row.league.abbreviation }] : [],
				),
				topScorer:
					leader && leader.totalPoints > 0
						? {
								name: leader.user.name,
								username: leader.user.username,
								points: leader.totalPoints,
							}
						: null,
			}
		},
	}),
}))

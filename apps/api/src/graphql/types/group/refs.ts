import { db } from "../../../db"
import type { QuestionShare } from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { NotFoundError } from "../../../lib/errors"
import {
	getOrCreateMemberInvite,
	getTrackedLeagueIds,
} from "../../../lib/groups"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	decodeOffsetCursor,
	encodeOffsetCursor,
	paginate,
} from "../../../lib/pagination"
import { ALL_TIME } from "../../../lib/seasons"
import { builder } from "../../builder"
import { type Connection, PageInfoRef } from "../pagination"
import { CallConnectionRef, QuestionConnectionRef } from "../question"
import { SeasonFilterInput, toSeasonFilter } from "../season-filter"
import { LeagueRef } from "../sports"
import { GroupRole } from "./enums"
import {
	GroupLeaderboardConnectionRef,
	GroupLeaderboardEntryRef,
	getGroupLeaderboard,
	getMemberUserIds,
} from "./leaderboard"

export const GroupInviteRef = builder.drizzleObject("groupInvites", {
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

export const GroupRef = builder.drizzleObject("groups", {
	name: "Group",
	fields: (t) => ({
		id: t.exposeID("id"),
		name: t.exposeString("name"),
		description: t.exposeString("description", { nullable: true }),
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
		// Whether the viewer hid the invite card on this group's page.
		viewerDismissedInviteCard: t.field({
			type: "Boolean",
			resolve: async (group, _args, ctx) => {
				if (!ctx.user) return false
				const membership = await db.query.groupMembers.findFirst({
					where: { groupId: group.id, userId: ctx.user.id },
					columns: { inviteCardDismissedAt: true },
				})
				return !!membership?.inviteCardDismissedAt
			},
		}),
		// The leagues this group counts on its leaderboard, activity feeds, and
		// shares. Empty means every league.
		trackedLeagues: t.field({
			type: [LeagueRef],
			resolve: async (group) => {
				const rows = await db.query.groupLeagues.findMany({
					where: { groupId: group.id },
					with: { league: true },
				})
				return rows
					.flatMap((row) => (row.league ? [row.league] : []))
					.sort((a, b) => a.name.localeCompare(b.name))
			},
		}),
		// ranked by total points across every call a member has made in the
		// group's tracked leagues, not just calls on questions created within
		// this group - there's no group-scoped question pool. Paginated (button-
		// driven "show more" on the frontend, not infinite scroll - most groups
		// are small, nobody needs the whole roster by default), optionally
		// scoped to one tracked league via leagueId (omitting it ranks across
		// all of them) and to a season via season (omitting it ranks all-time).
		// League, not sport, since e.g. NBA and NCAAB calls shouldn't rank
		// against each other despite both being basketball.
		leaderboard: t.field({
			type: GroupLeaderboardConnectionRef,
			args: {
				first: t.arg.int(),
				after: t.arg.string(),
				leagueId: t.arg.id(),
				season: t.arg({ type: SeasonFilterInput, required: false }),
			},
			resolve: async (group, args, ctx) => {
				const entries = (
					await getGroupLeaderboard(
						ctx,
						group.id,
						args.leagueId ?? null,
						toSeasonFilter(args.season),
					)
				).filter((entry) => entry.rank !== null)
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
		// convenience for group cards ("YOU'RE #2") that don't need the full
		// list. Deliberately all-time across every tracked league: it's a
		// standing summary on a card with no filter UI of its own, not the
		// leaderboard the group page renders. null until the viewer has a
		// resolved call in the group's tracked leagues.
		viewerRank: t.field({
			type: "Int",
			nullable: true,
			resolve: async (group, _args, ctx) => {
				const user = requireUser(ctx)
				const leaderboard = await getGroupLeaderboard(
					ctx,
					group.id,
					null,
					ALL_TIME,
				)
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
		// leagueId and season keep it in sync with whichever league tab and
		// season the table itself is showing.
		viewerLeaderboardEntry: t.field({
			type: GroupLeaderboardEntryRef,
			nullable: true,
			args: {
				leagueId: t.arg.id(),
				season: t.arg({ type: SeasonFilterInput, required: false }),
			},
			resolve: async (group, args, ctx) => {
				const user = requireUser(ctx)
				const leaderboard = await getGroupLeaderboard(
					ctx,
					group.id,
					args.leagueId ?? null,
					toSeasonFilter(args.season),
				)
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
				const [memberIds, tracked] = await Promise.all([
					getMemberUserIds(group.id),
					getTrackedLeagueIds(group.id),
				])
				const otherMemberIds = memberIds.filter((id) => id !== user.id)
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.calls.findMany({
					where: {
						userId: { in: otherMemberIds },
						...(tracked ? { question: { leagueId: { in: tracked } } } : {}),
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
				const [memberIds, tracked] = await Promise.all([
					getMemberUserIds(group.id),
					getTrackedLeagueIds(group.id),
				])
				const otherMemberIds = memberIds.filter((id) => id !== user.id)
				const limit = clampPageSize(args.first)
				const cursor = args.after ? decodeCursor(args.after) : null
				const rows = await db.query.questions.findMany({
					where: {
						creatorId: { in: otherMemberIds },
						...(tracked ? { leagueId: { in: tracked } } : {}),
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
				// Shares made before an admin narrowed the tracked set drop out
				// too, not just new ones (shareQuestionToGroup refuses those).
				const tracked = await getTrackedLeagueIds(group.id)
				const rows = await db.query.questionShares.findMany({
					where: {
						groupId: group.id,
						sharedBy: { ne: user.id },
						...(tracked ? { question: { leagueId: { in: tracked } } } : {}),
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

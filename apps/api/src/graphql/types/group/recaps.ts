import { and, desc, eq, gt } from "drizzle-orm"
import { db } from "../../../db"
import {
	type Group,
	groupMembers,
	groupRecaps,
	groups,
} from "../../../db/schema"
import { requireUser } from "../../../lib/auth"
import { AuthenticationError, AuthorizationError } from "../../../lib/errors"
import {
	loadReigningPlayersOfTheWeek,
	type ReigningPlayersOfTheWeek,
} from "../../../lib/group-recap/board"
import {
	loadRecapView,
	type RecapMoverView,
	type RecapPlayerOfTheWeekView,
	type RecapTile,
	type RecapView,
} from "../../../lib/group-recap/view"
import { formatWeekLabel } from "../../../lib/group-recap/week"
import { requireGroupAdmin, requireGroupMember } from "../../../lib/groups"
import { imageUrl } from "../../../lib/storage"
import { DAY_MS } from "../../../lib/time"
import { builder } from "../../builder"
import { UserRef } from "../user"
import { GroupPayload } from "./inputs"
import { viewerMembership } from "./leaderboard"
import { GroupRef } from "./refs"

// How long a recap stays on its group's page after it's made: long enough to
// be seen by everyone who opens the group that week, gone before it reads as
// old news.
export const RECAP_HOME_DAYS = 4

const RecapToneEnum = builder.enumType("RecapTone", {
	values: {
		SUCCESS: { value: "success" },
		DANGER: { value: "danger" },
		NEUTRAL: { value: "neutral" },
	},
})

const RecapTileRef = builder.objectRef<RecapTile>("RecapTile").implement({
	fields: (t) => ({
		// "best_call", "worst_miss", or one of the moment kinds - see
		// MOMENT_PRIORITY in lib/group-recap/view.ts. Not unique: calls tied
		// for best or worst each get a tile of the same kind.
		kind: t.exposeString("kind"),
		label: t.exposeString("label"),
		// Null for a group miss, which names nobody.
		user: t.field({ type: UserRef, nullable: true, resolve: (r) => r.user }),
		value: t.exposeString("value"),
		tone: t.field({ type: RecapToneEnum, resolve: (r) => r.tone }),
		headline: t.exposeString("headline"),
		note: t.exposeString("note"),
		leagueAbbr: t.exposeString("leagueAbbr"),
		callId: t.exposeID("callId", { nullable: true }),
	}),
})

const RecapMoverRef = builder
	.objectRef<RecapMoverView>("RecapMover")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (m) => m.user }),
			// Season-board ranks when the previous recap and this one were made.
			from: t.exposeInt("from"),
			to: t.exposeInt("to"),
		}),
	})

export const RecapPlayerOfTheWeekRef = builder
	.objectRef<RecapPlayerOfTheWeekView>("RecapPlayerOfTheWeek")
	.implement({
		fields: (t) => ({
			user: t.field({ type: UserRef, resolve: (p) => p.user }),
			// Calls plus any streak or sweep bonus, across the group's leagues.
			points: t.exposeInt("points"),
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
		}),
	})

const ReigningPlayersOfTheWeekRef = builder
	.objectRef<ReigningPlayersOfTheWeek>("ReigningPlayersOfTheWeek")
	.implement({
		fields: (t) => ({
			// The week they won: "Oct 6 to 12".
			weekLabel: t.string({ resolve: (r) => formatWeekLabel(r.week) }),
			users: t.field({ type: [UserRef], resolve: (r) => r.users }),
		}),
	})

const RecapRecordRef = builder
	.objectRef<RecapView["record"]>("RecapRecord")
	.implement({
		fields: (t) => ({
			wins: t.exposeInt("wins"),
			losses: t.exposeInt("losses"),
			activeMembers: t.exposeInt("activeMembers"),
			accuracy: t.exposeInt("accuracy", { nullable: true }),
		}),
	})

// A recap as anyone holding its link sees it. Nothing here identifies the
// group beyond its name and logo: groupId is only handed to members, the
// same people the group query would answer.
export const GroupRecapRef = builder
	.objectRef<RecapView>("GroupRecap")
	.implement({
		fields: (t) => ({
			id: t.id({ resolve: (v) => v.recap.id }),
			weekKey: t.string({ resolve: (v) => v.recap.weekKey }),
			// "Oct 6 to 12".
			weekLabel: t.exposeString("weekLabel"),
			createdAt: t.field({
				type: "DateTime",
				resolve: (v) => v.recap.createdAt,
			}),
			record: t.field({ type: RecapRecordRef, resolve: (v) => v.record }),
			// Usually one, several on a tie, empty when nobody qualified or the
			// winner is hidden from recaps.
			playersOfTheWeek: t.field({
				type: [RecapPlayerOfTheWeekRef],
				resolve: (v) => v.playersOfTheWeek,
			}),
			tiles: t.field({ type: [RecapTileRef], resolve: (v) => v.tiles }),
			climber: t.field({
				type: RecapMoverRef,
				nullable: true,
				resolve: (v) => v.climber,
			}),
			slide: t.field({
				type: RecapMoverRef,
				nullable: true,
				resolve: (v) => v.slide,
			}),
			cardVersion: t.exposeString("cardVersion"),
			// Null while the group's admins have recap links turned off.
			shareToken: t.string({
				nullable: true,
				resolve: (v) => (v.group.recapLinksEnabled ? v.recap.shareToken : null),
			}),
			groupName: t.string({ resolve: (v) => v.group.name }),
			groupLogoUrl: t.string({
				nullable: true,
				resolve: (v) => imageUrl(v.group.logoKey),
			}),
			groupId: t.id({
				nullable: true,
				resolve: async (v, _args, ctx) =>
					(await viewerMembership(ctx, v.group.id)) ? v.group.id : null,
			}),
		}),
	})

async function currentRecap(group: Group): Promise<RecapView | null> {
	const [recap] = await db
		.select()
		.from(groupRecaps)
		.where(
			and(
				eq(groupRecaps.groupId, group.id),
				gt(
					groupRecaps.createdAt,
					new Date(Date.now() - RECAP_HOME_DAYS * DAY_MS),
				),
			),
		)
		.orderBy(desc(groupRecaps.weekStart))
		.limit(1)
	return recap ? loadRecapView(recap, group) : null
}

builder.objectFields(GroupRef, (t) => ({
	// The latest recap, for RECAP_HOME_DAYS after it's made.
	currentRecap: t.field({
		type: GroupRecapRef,
		nullable: true,
		resolve: (group) => currentRecap(group),
	}),
	// Last week's winners, for the crown on the leaderboard.
	reigningPlayersOfTheWeek: t.field({
		type: ReigningPlayersOfTheWeekRef,
		nullable: true,
		resolve: (group) => loadReigningPlayersOfTheWeek(group.id),
	}),
	recapLinksEnabled: t.exposeBoolean("recapLinksEnabled"),
	recapShowsWorstMiss: t.exposeBoolean("recapShowsWorstMiss"),
	viewerHiddenFromRecaps: t.field({
		type: "Boolean",
		resolve: async (group, _args, ctx) =>
			!!(await viewerMembership(ctx, group.id))?.hiddenFromRecaps,
	}),
}))

builder.queryFields((t) => ({
	// Public: the token is the whole of the access check, the same as an
	// invite code. Null for an unknown token, and while the group's admins
	// have recap links off for anyone but the group's members, who reach it
	// from their Record Book.
	groupRecap: t.field({
		type: GroupRecapRef,
		nullable: true,
		args: { token: t.arg.string({ required: true }) },
		resolve: async (_root, args, ctx) => {
			const recap = await db.query.groupRecaps.findFirst({
				where: { shareToken: args.token },
			})
			if (!recap) return null
			const group = await db.query.groups.findFirst({
				where: { id: recap.groupId },
			})
			if (!group) return null
			if (!group.recapLinksEnabled && !(await viewerMembership(ctx, group.id)))
				return null
			return loadRecapView(recap, group)
		},
	}),
}))

const GroupRecapSettingsInput = builder.inputType("GroupRecapSettingsInput", {
	fields: (t) => ({
		groupId: t.id({ required: true }),
		linksEnabled: t.boolean({ required: true }),
		showsWorstMiss: t.boolean({ required: true }),
	}),
})

builder.mutationFields((t) => ({
	updateGroupRecapSettings: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "UpdateGroupRecapSettingsResult" },
		},
		args: { input: t.arg({ type: GroupRecapSettingsInput, required: true }) },
		resolve: async (_root, { input }, ctx) => {
			const user = requireUser(ctx)
			const groupId = String(input.groupId)
			await requireGroupAdmin(groupId, user.id)
			const [group] = await db
				.update(groups)
				.set({
					recapLinksEnabled: input.linksEnabled,
					recapShowsWorstMiss: input.showsWorstMiss,
				})
				.where(eq(groups.id, groupId))
				.returning()
			if (!group) {
				throw new Error("updateGroupRecapSettings: group vanished mid-request")
			}
			return { group }
		},
	}),

	// Any member, for themselves only.
	setHiddenFromRecaps: t.field({
		type: GroupPayload,
		errors: {
			types: [AuthenticationError, AuthorizationError],
			directResult: true,
			union: { name: "SetHiddenFromRecapsResult" },
		},
		args: {
			groupId: t.arg.id({ required: true }),
			hidden: t.arg.boolean({ required: true }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const groupId = String(args.groupId)
			const membership = await requireGroupMember(groupId, user.id)
			await db
				.update(groupMembers)
				.set({ hiddenFromRecaps: args.hidden })
				.where(eq(groupMembers.id, membership.id))
			const group = await db.query.groups.findFirst({ where: { id: groupId } })
			if (!group) {
				throw new Error("setHiddenFromRecaps: group vanished mid-request")
			}
			return { group }
		},
	}),
}))

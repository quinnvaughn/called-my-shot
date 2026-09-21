import { type AchievementKind, achievementText } from "@called-my-shot/schemas"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { notifications } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import { AuthenticationError } from "../../lib/errors"
import { keysetPaginate } from "../../lib/pagination"
import { builder } from "../builder"
import { indexByKey } from "../loader"
import { type Connection, PageInfoRef } from "./pagination"
import { GameRef } from "./sports"
import { StreakFamilyEnum } from "./user"

type NotificationRow = typeof notifications.$inferSelect

// One row shape backs every variant below (see db/schema/notifications.ts) -
// this map is what turns "type: 'call_resolved'" into "this row serializes
// as a CallResolvedNotification", since nothing about the row itself is a
// distinct JS class Pothos could `instanceof`-check the way it does for the
// Error interface in errors.ts.
const GQL_TYPE_BY_ROW_TYPE: Record<NotificationRow["type"], string> = {
	call_resolved: "CallResolvedNotification",
	dispute_filed: "DisputeFiledNotification",
	dispute_upheld: "DisputeUpheldNotification",
	dispute_overturned: "DisputeOverturnedNotification",
	question_voided: "QuestionVoidedNotification",
	call_voided: "CallVoidedNotification",
	group_member_joined: "GroupMemberJoinedNotification",
	question_shared_to_group: "QuestionSharedToGroupNotification",
	sweep_completed: "SweepCompletedNotification",
	streak_milestone: "StreakMilestoneNotification",
	streak_personal_best: "StreakPersonalBestNotification",
	streak_snapped: "StreakSnappedNotification",
	game_reminder: "GameReminderNotification",
}

// The sentence the row is told in, shared with the results email's
// achievement lines.
const achievementMessage = (kind: AchievementKind) => (row: NotificationRow) =>
	achievementText({
		kind,
		label: row.achievementLabel ?? "",
		count: row.achievementCount ?? 0,
		previousBest: row.previousBest,
	})

// The one thing every notification variant has regardless of what happened -
// id/createdAt/readAt. Everything about *what happened* lives on the
// concrete type below instead of as optional fields bolted onto one shared
// shape, so a client asking for a QuestionVoidedNotification's fields simply
// has no way to ask for, say, pointsDelta - the schema itself enforces "this
// field only makes sense for that kind of notification" instead of leaving
// it to nullability + convention.
//
// Every variant is a drizzleObject over the same table, so its question/
// group/actor/league fields are relations the plugin batches across the
// whole page rather than a lookup per row.
const NotificationNode = builder.drizzleInterface("notifications", {
	name: "NotificationNode",
	resolveType: (row) => GQL_TYPE_BY_ROW_TYPE[row.type],
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({
			type: "DateTime",
			resolve: (row) => row.createdAt,
		}),
		readAt: t.field({
			type: "DateTime",
			nullable: true,
			resolve: (row) => row.readAt,
		}),
	}),
})

// Your call on a question got scored (won or lost) - see resolveQuestionInternal.
builder.drizzleObject("notifications", {
	variant: "CallResolvedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		pointsDelta: t.exposeInt("pointsDelta", { nullable: true }),
	}),
})

// Someone disputed your resolution of a question you created - see fileDispute.
builder.drizzleObject("notifications", {
	variant: "DisputeFiledNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		actor: t.relation("actor", { nullable: true }),
		actorUsername: t.exposeString("actorUsername", { nullable: true }),
	}),
})

// A dispute you filed was upheld - the original resolution stands, your
// challenge didn't succeed. See upholdDispute.
builder.drizzleObject("notifications", {
	variant: "DisputeUpheldNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
	}),
})

// A dispute you filed was overturned - the resolution was corrected in your
// favor. See overturnDispute; a CallResolvedNotification for the corrected
// points usually follows this one.
builder.drizzleObject("notifications", {
	variant: "DisputeOverturnedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
	}),
})

// A question you created was voided by an admin - see voidQuestion.
// strikeCount is only set when the void counted as a strike.
builder.drizzleObject("notifications", {
	variant: "QuestionVoidedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		strikeCount: t.exposeInt("strikeCount", { nullable: true }),
	}),
})

// A question you called was voided without a result - see markQuestionVoided.
// Unlike QuestionVoidedNotification, the question still exists to link to.
builder.drizzleObject("notifications", {
	variant: "CallVoidedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
	}),
})

// Someone joined a group you're in - see joinGroupByCode.
builder.drizzleObject("notifications", {
	variant: "GroupMemberJoinedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		group: t.relation("group", { nullable: true }),
		groupName: t.exposeString("groupName", { nullable: true }),
		actor: t.relation("actor", { nullable: true }),
		actorUsername: t.exposeString("actorUsername", { nullable: true }),
	}),
})

// Someone shared a question into a group you're in - see shareQuestionToGroup.
builder.drizzleObject("notifications", {
	variant: "QuestionSharedToGroupNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		group: t.relation("group", { nullable: true }),
		groupName: t.exposeString("groupName", { nullable: true }),
		question: t.relation("question", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		actor: t.relation("actor", { nullable: true }),
		actorUsername: t.exposeString("actorUsername", { nullable: true }),
	}),
})

// You picked every winner in a slate - see recomputeSlate in
// lib/streaks/recompute.ts. achievementLabel is the slate's name as of then
// ("NFL Week 3 Sunday Early").
builder.drizzleObject("notifications", {
	variant: "SweepCompletedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		league: t.relation("league", { nullable: true }),
		slateKey: t.exposeString("slateKey", { nullable: true }),
		achievementLabel: t.exposeString("achievementLabel", { nullable: true }),
		gameCount: t.exposeInt("achievementCount", { nullable: true }),
		message: t.field({
			type: "String",
			resolve: achievementMessage("sweep_completed"),
		}),
	}),
})

// A streak reached a multiple of STREAK_MILESTONE_STEP - see streakEvents in
// lib/streaks/compute.ts, as are the two below.
builder.drizzleObject("notifications", {
	variant: "StreakMilestoneNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		league: t.relation("league", { nullable: true }),
		streakFamily: t.field({
			type: StreakFamilyEnum,
			nullable: true,
			resolve: (row) => row.streakFamily,
		}),
		achievementLabel: t.exposeString("achievementLabel", { nullable: true }),
		streakLength: t.exposeInt("achievementCount", { nullable: true }),
		message: t.field({
			type: "String",
			resolve: achievementMessage("streak_milestone"),
		}),
	}),
})

// A streak passed the best run the track had before it.
builder.drizzleObject("notifications", {
	variant: "StreakPersonalBestNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		league: t.relation("league", { nullable: true }),
		streakFamily: t.field({
			type: StreakFamilyEnum,
			nullable: true,
			resolve: (row) => row.streakFamily,
		}),
		achievementLabel: t.exposeString("achievementLabel", { nullable: true }),
		streakLength: t.exposeInt("achievementCount", { nullable: true }),
		previousBest: t.exposeInt("previousBest", { nullable: true }),
		message: t.field({
			type: "String",
			resolve: achievementMessage("streak_personal_best"),
		}),
	}),
})

// A streak long enough to announce ended on a miss.
builder.drizzleObject("notifications", {
	variant: "StreakSnappedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		league: t.relation("league", { nullable: true }),
		streakFamily: t.field({
			type: StreakFamilyEnum,
			nullable: true,
			resolve: (row) => row.streakFamily,
		}),
		achievementLabel: t.exposeString("achievementLabel", { nullable: true }),
		streakLength: t.exposeInt("achievementCount", { nullable: true }),
		message: t.field({
			type: "String",
			resolve: achievementMessage("streak_snapped"),
		}),
	}),
})

// A game you asked to be reminded about starts within the hour - see
// drainGameReminders in lib/game-reminders.tsx. Null game only once the game
// itself has been deleted.
builder.drizzleObject("notifications", {
	variant: "GameReminderNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		// No relation from notifications to games, so batched by hand.
		game: t.loadable({
			type: GameRef,
			nullable: true,
			load: async (ids: string[]) => {
				const rows = await db.query.games.findMany({
					where: { id: { in: ids } },
				})
				return indexByKey(ids, rows, (game) => game.id, null)
			},
			resolve: (row) => row.gameId,
		}),
	}),
})

const NotificationConnectionRef = builder
	.objectRef<Connection<NotificationRow>>("NotificationConnection")
	.implement({
		fields: (t) => ({
			items: t.field({ type: [NotificationNode], resolve: (c) => c.items }),
			pageInfo: t.field({ type: PageInfoRef, resolve: (c) => c.pageInfo }),
		}),
	})

builder.queryFields((t) => ({
	notifications: t.field({
		type: NotificationConnectionRef,
		errors: { types: [AuthenticationError] },
		args: {
			first: t.arg.int(),
			after: t.arg.string(),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			return keysetPaginate(args, (page) =>
				db.query.notifications.findMany({
					where: { userId: user.id, ...page.where },
					orderBy: page.orderBy,
					limit: page.limit,
				}),
			)
		},
	}),
	unreadNotificationCount: t.field({
		type: "Int",
		errors: { types: [AuthenticationError] },
		resolve: async (_root, _args, ctx) => {
			const user = requireUser(ctx)
			const [row] = await db
				.select({ n: count() })
				.from(notifications)
				.where(
					and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
				)
			return row?.n ?? 0
		},
	}),
}))

builder.mutationFields((t) => ({
	// Omitted/empty ids marks every unread notification read (the "mark all
	// read" action); a non-empty list marks just those - always scoped to the
	// caller's own rows regardless of which ids are passed.
	markNotificationsRead: t.field({
		type: "Boolean",
		errors: { types: [AuthenticationError] },
		args: {
			ids: t.arg({ type: ["ID"], required: false }),
		},
		resolve: async (_root, args, ctx) => {
			const user = requireUser(ctx)
			const scope = and(
				eq(notifications.userId, user.id),
				isNull(notifications.readAt),
			)
			await db
				.update(notifications)
				.set({ readAt: new Date() })
				.where(
					args.ids && args.ids.length > 0
						? and(scope, inArray(notifications.id, args.ids))
						: scope,
				)
			return true
		},
	}),
}))

import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { notifications } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import { AuthenticationError } from "../../lib/errors"
import {
	clampPageSize,
	cursorWhere,
	decodeCursor,
	paginate,
} from "../../lib/pagination"
import { builder } from "../builder"
import { GroupRef } from "./group"
import { PageInfoRef } from "./pagination"
import { QuestionRef } from "./question"
import { UserRef } from "./user"

type Connection<T> = {
	items: T[]
	pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

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
	group_member_joined: "GroupMemberJoinedNotification",
	question_shared_to_group: "QuestionSharedToGroupNotification",
}

function resolveQuestion(row: { questionId: string | null }) {
	return row.questionId
		? db.query.questions.findFirst({ where: { id: row.questionId } })
		: null
}
function resolveGroup(row: { groupId: string | null }) {
	return row.groupId
		? db.query.groups.findFirst({ where: { id: row.groupId } })
		: null
}
function resolveActor(row: { actorId: string | null }) {
	return row.actorId
		? db.query.users.findFirst({ where: { id: row.actorId } })
		: null
}

// The one thing every notification variant has regardless of what happened -
// id/createdAt/readAt. Everything about *what happened* lives on the
// concrete type below instead of as optional fields bolted onto one shared
// shape, so a client asking for a QuestionVoidedNotification's fields simply
// has no way to ask for, say, pointsDelta - the schema itself enforces "this
// field only makes sense for that kind of notification" instead of leaving
// it to nullability + convention.
const NotificationNode = builder.interfaceRef<NotificationRow>("NotificationNode").implement({
	resolveType: (row) => GQL_TYPE_BY_ROW_TYPE[row.type],
	fields: (t) => ({
		id: t.exposeID("id"),
		createdAt: t.field({
			type: "String",
			resolve: (row) => row.createdAt.toISOString(),
		}),
		readAt: t.field({
			type: "String",
			nullable: true,
			resolve: (row) => row.readAt?.toISOString() ?? null,
		}),
	}),
})

// Your call on a question got scored (won or lost) - see resolveQuestionInternal.
builder
	.objectRef<NotificationRow>("CallResolvedNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			question: t.field({ type: QuestionRef, nullable: true, resolve: resolveQuestion }),
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
			pointsDelta: t.exposeInt("pointsDelta", { nullable: true }),
		}),
	})

// Someone disputed your resolution of a question you created - see fileDispute.
builder
	.objectRef<NotificationRow>("DisputeFiledNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			question: t.field({ type: QuestionRef, nullable: true, resolve: resolveQuestion }),
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
			actor: t.field({ type: UserRef, nullable: true, resolve: resolveActor }),
			actorUsername: t.exposeString("actorUsername", { nullable: true }),
		}),
	})

// A dispute you filed was upheld - the original resolution stands, your
// challenge didn't succeed. See upholdDispute.
builder
	.objectRef<NotificationRow>("DisputeUpheldNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			question: t.field({ type: QuestionRef, nullable: true, resolve: resolveQuestion }),
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
		}),
	})

// A dispute you filed was overturned - the resolution was corrected in your
// favor. See overturnDispute; a CallResolvedNotification for the corrected
// points usually follows this one.
builder
	.objectRef<NotificationRow>("DisputeOverturnedNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			question: t.field({ type: QuestionRef, nullable: true, resolve: resolveQuestion }),
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
		}),
	})

// A question you created was voided by an admin - see voidQuestion.
// strikeCount is only set when the void counted as a strike.
builder
	.objectRef<NotificationRow>("QuestionVoidedNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
			strikeCount: t.exposeInt("strikeCount", { nullable: true }),
		}),
	})

// Someone joined a group you're in - see joinGroupByCode.
builder
	.objectRef<NotificationRow>("GroupMemberJoinedNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			group: t.field({ type: GroupRef, nullable: true, resolve: resolveGroup }),
			groupName: t.exposeString("groupName", { nullable: true }),
			actor: t.field({ type: UserRef, nullable: true, resolve: resolveActor }),
			actorUsername: t.exposeString("actorUsername", { nullable: true }),
		}),
	})

// Someone shared a question into a group you're in - see shareQuestionToGroup.
builder
	.objectRef<NotificationRow>("QuestionSharedToGroupNotification")
	.implement({
		interfaces: [NotificationNode],
		fields: (t) => ({
			group: t.field({ type: GroupRef, nullable: true, resolve: resolveGroup }),
			groupName: t.exposeString("groupName", { nullable: true }),
			question: t.field({ type: QuestionRef, nullable: true, resolve: resolveQuestion }),
			questionTitle: t.exposeString("questionTitle", { nullable: true }),
			actor: t.field({ type: UserRef, nullable: true, resolve: resolveActor }),
			actorUsername: t.exposeString("actorUsername", { nullable: true }),
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
			const limit = clampPageSize(args.first)
			const cursor = args.after ? decodeCursor(args.after) : null
			const rows = await db.query.notifications.findMany({
				where: {
					userId: user.id,
					...(cursor ? cursorWhere(cursor) : {}),
				},
				orderBy: { createdAt: "desc", id: "desc" },
				limit: limit + 1,
			})
			return paginate(rows, limit)
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

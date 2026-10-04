import { type AchievementKind, achievementText } from "@called-my-shot/schemas"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { notifications } from "../../db/schema"
import { requireUser } from "../../lib/auth"
import { AuthenticationError } from "../../lib/errors"
import { fadeWinner } from "../../lib/fades"
import { keysetPaginate } from "../../lib/pagination"
import { builder } from "../builder"
import { indexByKey } from "../loader"
import { type Connection, PageInfoRef } from "./pagination"
import { GloatMessageEnum } from "./question/fade"
import {
	callSideLoader,
	fadeByFaderLoader,
	fadesByTargetLoader,
} from "./question/loaders"
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
	redo_earned: "RedoEarnedNotification",
	call_faded: "CallFadedNotification",
	fade_gloated: "FadeGloatedNotification",
	group_pins_expired: "GroupPinsExpiredNotification",
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

// How the fades on a resolved call came out, from the recipient's side. The
// fader half is set when their call faded someone; the doubter half when
// their call was faded. Read live off the fades, not snapshotted, so it
// follows a re-resolve and simply drops out if a linked call is deleted.
type CallResolvedFade = {
	fadedUsername: string | null
	fadeLanded: boolean | null
	targetFlipped: boolean
	doubterCount: number
	doubtersCashed: number
	doubtersWrong: number
	gloatOpen: boolean
}

const CallResolvedFadeRef = builder
	.objectRef<CallResolvedFade>("CallResolvedFade")
	.implement({
		fields: (t) => ({
			// Whose call the recipient faded. Null when they faded nobody.
			fadedUsername: t.exposeString("fadedUsername", { nullable: true }),
			// Whether that fade was right. Null when there's no answer: a flip
			// or a void.
			fadeLanded: t.exposeBoolean("fadeLanded", { nullable: true }),
			// The call they faded redid onto their side.
			targetFlipped: t.exposeBoolean("targetFlipped"),
			// How many calls faded the recipient's, and how those came out.
			// Cashed and wrong needn't add up to the count: a doubter the
			// recipient flipped onto the same side neither won nor lost.
			doubterCount: t.exposeInt("doubterCount"),
			doubtersCashed: t.exposeInt("doubtersCashed"),
			doubtersWrong: t.exposeInt("doubtersWrong"),
			// The recipient won a side of a fade here and hasn't gloated on it
			// yet, so the call page still offers them a gloat.
			gloatOpen: t.exposeBoolean("gloatOpen"),
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
		// The recipient's resolved call.
		call: t.relation("call", { nullable: true }),
		// Null unless the call faded someone or was faded.
		fade: t.field({
			type: CallResolvedFadeRef,
			nullable: true,
			resolve: async (row, _args, ctx): Promise<CallResolvedFade | null> => {
				if (!row.callId) return null
				const [fading, doubters] = await Promise.all([
					fadeByFaderLoader(ctx).load(row.callId),
					fadesByTargetLoader(ctx).load(row.callId),
				])
				if (!fading && doubters.length === 0) return null

				const winnerOf = async (fade: {
					faderCallId: string
					targetCallId: string
				}) => {
					const [fader, target] = await Promise.all([
						callSideLoader(ctx).load(fade.faderCallId),
						callSideLoader(ctx).load(fade.targetCallId),
					])
					return fadeWinner(fader ?? undefined, target ?? undefined)
				}

				const faded = fading
					? await db.query.calls.findFirst({
							where: { id: fading.targetCallId },
							columns: {},
							with: { user: { columns: { username: true } } },
						})
					: undefined
				const fadingWinner = fading ? await winnerOf(fading) : null
				const doubterWinners = await Promise.all(doubters.map(winnerOf))

				return {
					fadedUsername: faded?.user?.username ?? null,
					fadeLanded: fadingWinner === null ? null : fadingWinner === "fader",
					targetFlipped: fading?.targetFlippedAt != null,
					doubterCount: doubters.length,
					doubtersCashed: doubterWinners.filter((w) => w === "fader").length,
					doubtersWrong: doubterWinners.filter((w) => w === "target").length,
					gloatOpen:
						(fadingWinner === "fader" && fading?.faderGloatedAt === null) ||
						doubters.some(
							(fade, i) =>
								doubterWinners[i] === "target" && fade.targetGloatedAt === null,
						),
				}
			},
		}),
	}),
})

// Someone faded your call - see recordFade. call is the recipient's own call,
// the one the fade was aimed at.
builder.drizzleObject("notifications", {
	variant: "CallFadedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		actor: t.relation("actor", { nullable: true }),
		actorUsername: t.exposeString("actorUsername", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		call: t.relation("call", { nullable: true }),
	}),
})

// The winning side of a fade you lost gloated - see gloat in lib/fades.ts.
// call is the recipient's own call, the losing side.
builder.drizzleObject("notifications", {
	variant: "FadeGloatedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		actor: t.relation("actor", { nullable: true }),
		actorUsername: t.exposeString("actorUsername", { nullable: true }),
		questionTitle: t.exposeString("questionTitle", { nullable: true }),
		call: t.relation("call", { nullable: true }),
		// The line they sent. Read off the fade between the two calls; null if
		// either call is gone.
		gloat: t.field({
			type: GloatMessageEnum,
			nullable: true,
			resolve: async (row, _args, ctx) => {
				if (!row.callId) return null
				const fading = await fadeByFaderLoader(ctx).load(row.callId)
				if (fading) {
					const target = await callSideLoader(ctx).load(fading.targetCallId)
					if (target?.userId === row.actorId) return fading.targetGloatMessage
				}
				const doubters = await fadesByTargetLoader(ctx).load(row.callId)
				for (const fade of doubters) {
					const fader = await callSideLoader(ctx).load(fade.faderCallId)
					if (fader?.userId === row.actorId) return fade.faderGloatMessage
				}
				return null
			},
		}),
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

// The last callable question pinned in a group you admin has locked - see
// expireGroupPins.
builder.drizzleObject("notifications", {
	variant: "GroupPinsExpiredNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		group: t.relation("group", { nullable: true }),
		groupName: t.exposeString("groupName", { nullable: true }),
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

// Someone you invited made their first call, so your half of the invite
// landed - see qualifyReferralOnFirstCall. Also sent when a credit that had
// been waiting on a full wallet is finally granted, which is the other moment
// a redo actually appears.
builder.drizzleObject("notifications", {
	variant: "RedoEarnedNotification",
	interfaces: [NotificationNode],
	fields: (t) => ({
		actor: t.relation("actor", { nullable: true }),
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

import {
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { games } from "./games"
import { groups } from "./groups"
import { pressers } from "./pressers"
import { resolutionDisputes } from "./question-moderation"
import { questions } from "./questions"
import { leagues } from "./sports"
import { streakFamily } from "./streaks"
import { users } from "./users"

export const notificationType = pgEnum("notification_type", [
	"call_resolved",
	"dispute_filed",
	"dispute_upheld",
	"dispute_overturned",
	"question_voided",
	"call_voided",
	"group_member_joined",
	"question_shared_to_group",
	"sweep_completed",
	"streak_milestone",
	"streak_personal_best",
	"streak_snapped",
	"game_reminder",
	"redo_earned",
	"call_faded",
	"fade_gloated",
	"group_pins_expired",
	"game_resolved",
	"presser_question_received",
	"presser_answered",
])

// One row per (recipient, thing that happened) - see hook points in
// resolveQuestionInternal/fileDispute/upholdDispute/overturnDispute/
// voidQuestion/joinGroupByCode/shareQuestionToGroup. questionTitle/groupName/
// actorUsername are snapshots taken at insert time, not live joins - same
// reasoning as questionVoids.questionTitle (voidQuestion hard-deletes the
// question right after), so a notification still reads sensibly once its
// linked question/group/actor is gone. The nullable id columns are kept
// alongside the snapshots purely for deep-linking when the target still
// exists; nothing here depends on them being non-null.
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: notificationType("type").notNull(),
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		questionId: uuid("question_id").references(() => questions.id, {
			onDelete: "set null",
		}),
		groupId: uuid("group_id").references(() => groups.id, {
			onDelete: "cascade",
		}),
		disputeId: uuid("dispute_id").references(() => resolutionDisputes.id, {
			onDelete: "set null",
		}),
		// game_reminder, and game_resolved
		gameId: uuid("game_id").references(() => games.id, {
			onDelete: "set null",
		}),
		// call_resolved: the recipient's own call, which its fade line reads
		// from. call_faded: the recipient's call that was faded.
		// fade_gloated: the recipient's call that lost the fade.
		callId: uuid("call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		// presser_question_received: the recipient's own presser.
		// presser_answered: the presser whose owner answered the recipient.
		presserId: uuid("presser_id").references(() => pressers.id, {
			onDelete: "cascade",
		}),
		questionTitle: text("question_title"),
		groupName: text("group_name"),
		actorUsername: text("actor_username"),
		// call_resolved only
		pointsDelta: integer("points_delta"),
		// question_voided only, and only when the void counted as a strike
		strikeCount: integer("strike_count"),
		// The sweep and streak types. achievementLabel is a snapshot of what the
		// run or slate was called ("NFL Player Stats", "NFL Week 3 Sunday Early");
		// achievementCount is the streak's length or the sweep's game count.
		leagueId: uuid("league_id").references(() => leagues.id, {
			onDelete: "cascade",
		}),
		streakFamily: streakFamily("streak_family"),
		slateKey: text("slate_key"),
		achievementLabel: text("achievement_label"),
		achievementCount: integer("achievement_count"),
		// streak_personal_best only - the best it beat.
		previousBest: integer("previous_best"),
		// Set only on a type that's updated in place instead of added again:
		// game_resolved, one per recipient and game, and
		// presser_question_received, one per presser (see dedupeKeyFor).
		// Null everywhere else, and nulls never collide on the unique index.
		dedupeKey: text("dedupe_key"),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("notifications_user_read_created_idx").on(
			t.userId,
			t.readAt,
			t.createdAt,
		),
		uniqueIndex("notifications_user_dedupe_key_idx").on(t.userId, t.dedupeKey),
	],
)
export type Notification = typeof notifications.$inferSelect

// One row per sweep or streak event ever announced to a user. The primary key
// is the whole idempotency story: a track or slate is rebuilt many times, and
// a result can be overturned and restored, so the same event gets detected
// again and again - only the insert that lands here gets a notification.
// Also what the results digest reads to add its achievement lines, stamping
// emailedAt once one has gone out. See lib/streaks/notices.ts for the key
// formats.
export const achievementNotices = pgTable(
	"achievement_notices",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		dedupeKey: text("dedupe_key").notNull(),
		// Null only between this row's insert and its notification's, inside
		// the same transaction.
		notificationId: uuid("notification_id").references(() => notifications.id, {
			onDelete: "cascade",
		}),
		emailedAt: timestamp("emailed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.dedupeKey] })],
)
export type AchievementNotice = typeof achievementNotices.$inferSelect

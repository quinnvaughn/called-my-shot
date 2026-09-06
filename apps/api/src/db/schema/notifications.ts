import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { groups } from "./groups"
import { resolutionDisputes } from "./question-moderation"
import { questions } from "./questions"
import { users } from "./users"

export const notificationType = pgEnum("notification_type", [
	"call_resolved",
	"dispute_filed",
	"dispute_upheld",
	"dispute_overturned",
	"question_voided",
	"group_member_joined",
	"question_shared_to_group",
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
		questionTitle: text("question_title"),
		groupName: text("group_name"),
		actorUsername: text("actor_username"),
		// call_resolved only
		pointsDelta: integer("points_delta"),
		// question_voided only, and only when the void counted as a strike
		strikeCount: integer("strike_count"),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("notifications_user_read_created_idx").on(
			t.userId,
			t.readAt,
			t.createdAt,
		),
	],
)
export type Notification = typeof notifications.$inferSelect

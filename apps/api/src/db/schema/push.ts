import { sql } from "drizzle-orm"
import {
	boolean,
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
import { notifications, notificationType } from "./notifications"
import { sessions, users } from "./users"

// Every notification type, plus "all". Built from notificationType rather than
// listed out, so a new notification type is a push toggle the moment it ships
// instead of a second list to remember. Not emailPreferenceType: that one
// carries email-only types and is missing some notification types.
export const pushPreferenceType = pgEnum("push_preference_type", [
	"all",
	...notificationType.enumValues,
])
export type PushPreferenceType = (typeof pushPreferenceType.enumValues)[number]

// Opt-OUT rows, the same model as emailOptOuts: a row means muted, no row
// means on. Account-wide, so muting a type mutes it on every device.
export const pushOptOuts = pgTable(
	"push_opt_outs",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: pushPreferenceType("type").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.type] })],
)

// One row per browser that turned push on. Tied to the session it was saved
// under, so signing out or resetting a password stops pushes to that device
// along with everything else the session could do. A session that expires is
// never deleted, so the drain also checks sessions.expires_at; reopening the
// app after signing back in re-saves the subscription under the new session
// (usePushSync on the web).
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		// The push service URL. Unique: one browser has one endpoint, and the
		// same browser signing into a second account moves it there.
		endpoint: text("endpoint").notNull().unique(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		platform: text("platform", {
			enum: ["ios", "android", "desktop"],
		}).notNull(),
		// Whether it was saved from the home-screen app rather than a tab.
		standalone: boolean("standalone").notNull().default(false),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
		lastSuccessAt: timestamp("last_success_at"),
		lastFailureAt: timestamp("last_failure_at"),
		failureCount: integer("failure_count").notNull().default(0),
		lastError: text("last_error"),
	},
	(t) => [index("push_subscriptions_user_idx").on(t.userId)],
)
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect

// One row per push waiting to go out, written in the same transaction as the
// in-app notification it announces (lib/push-outbox.ts) and drained by
// lib/push-drain.ts. Like emailOutbox, it exists because createNotifications
// runs inside its caller's transaction, where an inline send would fire before
// commit and again on retry.
//
// collapseKey is what makes a game's results one push: every notification for
// the same key lands on the one unsent row, which waits out a short hold
// (sendAfter) so the rest of the game can settle into it. It is also the
// notification's tag on the device, so a later push for the same key replaces
// the earlier one instead of stacking.
export const pushOutbox = pgTable(
	"push_outbox",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: notificationType("type").notNull(),
		// The latest notification folded into this row. Cascade, so a
		// notification deleted with its question takes the push with it.
		notificationId: uuid("notification_id")
			.notNull()
			.references(() => notifications.id, { onDelete: "cascade" }),
		collapseKey: text("collapse_key").notNull(),
		sendAfter: timestamp("send_after").notNull(),
		sentAt: timestamp("sent_at"),
		// Stamped alongside sentAt when nothing went out: muted, no device,
		// already read in-app, or the same words as the last push for this key.
		skippedReason: text("skipped_reason"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		// How many devices accepted it. Zero on a skipped row.
		deliveredCount: integer("delivered_count").notNull().default(0),
		// What was sent, so a later row for the same key can tell whether it
		// would say anything new.
		title: text("title"),
		body: text("body"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("push_outbox_unsent_key_idx")
			.on(t.userId, t.collapseKey)
			.where(sql`sent_at is null`),
		index("push_outbox_pending_idx")
			.on(t.sendAfter)
			.where(sql`sent_at is null`),
		index("push_outbox_sent_key_idx").on(t.userId, t.collapseKey, t.sentAt),
	],
)
export type PushOutboxRow = typeof pushOutbox.$inferSelect

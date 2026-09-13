import { sql } from "drizzle-orm"
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
import { questions } from "./questions"
import { seasons } from "./sports"
import { users } from "./users"

// Every member of notificationType, plus "all", plus the members below it.
// Mirroring notificationType is what makes a future email type a toggle
// rather than a migration - every in-app notification is a thing we might
// eventually also send mail about, and a divergent second taxonomy would mean
// mapping between them at every gate.
//
// The mirror only runs one way, though: a notification implies a possible
// email, an email does not imply a notification. "season_starting" is the
// first of the second kind - it is a broadcast on a calendar, not a reaction
// to something that happened to this person, and telling someone in-app that
// a season is about to start is worth nothing to someone who is already
// in-app. Anything past this comment is email-only by the same test.
//
// "call_resolved" (lib/email-digest.ts) and "season_starting"
// (lib/season-start-email.tsx) actually send today; the rest exist so the
// opt-out someone sets now is still honored when its email ships.
export const emailPreferenceType = pgEnum("email_preference_type", [
	"all",
	"call_resolved",
	"dispute_filed",
	"dispute_upheld",
	"dispute_overturned",
	"question_voided",
	"call_voided",
	"group_member_joined",
	"question_shared_to_group",
	// Email-only - see above.
	"season_starting",
])
export type EmailPreferenceType =
	(typeof emailPreferenceType.enumValues)[number]

// Opt-OUT rows: a row means muted, no row means subscribed. The inverse
// (a preferences row per user per type) would need a backfill for every
// existing user, a default to keep in sync in two places, and another
// backfill each time a type is added - this needs none of that, and a new
// email type is live for everyone the moment it ships. "all" is the master
// kill switch and mutes every type at once.
//
// Auth mail is NOT gated by this table - see isEmailMuted in lib/email-prefs.
export const emailOptOuts = pgTable(
	"email_opt_outs",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: emailPreferenceType("type").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.type] })],
)
export type EmailOptOut = typeof emailOptOuts.$inferSelect

// One row per (user, resolved call), drained into per-user digests by
// lib/email-digest.ts rather than sent inline. Two reasons it isn't a direct
// send at resolve time: resolveQuestionInternal runs inside a transaction
// (an inline send would fire before commit and again on retry), and
// sync-live-scores resolves a whole slate of games at once, which would mean
// eight separate emails to the same person in an hour.
export const emailOutbox = pgTable(
	"email_outbox",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: emailPreferenceType("type").notNull(),
		// Cascade, so a voided question's unsent rows delete themselves rather
		// than the drain having to notice the question is gone.
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		callId: uuid("call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		// Deliberately carries no snapshot of the result. Everything the email
		// says about a call - title, pick, points, win/loss - is read at drain
		// time through loadResolvedCallSummaries, the same function the shared
		// PNG is built from, so the email and the card cannot describe the same
		// pick two different ways. The window between enqueue and send is a few
		// minutes, and the two things that could change inside it are both
		// handled: a voided question cascades this row away, and a disputed one
		// is caught by the drain's status re-check.
		sentAt: timestamp("sent_at"),
		// Set alongside sentAt when the row was resolved without actually
		// mailing anything (muted, unverified address, question no longer
		// resolved). Keeps "we deliberately didn't send" distinguishable from
		// "we sent" without a second table.
		skippedReason: text("skipped_reason"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		// Drives the settling window - the drain waits until a user's OLDEST
		// unsent row is old enough, which is what coalesces a burst of games
		// finishing together into one email.
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// One resolution enqueues a call once. Partial rather than a plain
		// unique so that a re-resolve (overturnDispute re-scores an already
		// settled question) can enqueue again once the first email has gone
		// out - the points really did change and that's worth a second mail.
		uniqueIndex("email_outbox_unsent_call_idx")
			.on(t.callId)
			.where(sql`sent_at is null`),
		index("email_outbox_pending_idx")
			.on(t.userId, t.createdAt)
			.where(sql`sent_at is null`),
	],
)
export type EmailOutboxRow = typeof emailOutbox.$inferSelect

// One row per (user, league season) for the "your sport is back" email -
// both the send record and the dedupe key, the way emailOutbox is above.
// Deliberately NOT a second use of emailOutbox: that table's questionId and
// callId are non-null on purpose, and this email is about a season, not
// about anything a particular person did. Widening those two columns to
// nullable would cost every reader of the resolution path a null check to
// save one table here.
//
// The unique constraint is the whole idempotency story. The enqueue pass
// (lib/season-start-email.tsx) reruns daily for as long as a season sits
// inside the lead window, so it tries to insert the same (user, season)
// about seven times - onConflictDoNothing turns the other six into no-ops.
// It also means a season a user was mailed about can never be mailed about
// again, including after a re-enqueue years later.
export const seasonStartEmails = pgTable(
	"season_start_emails",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Cascade: a season row deleted by a sync correction takes its unsent
		// announcements with it rather than leaving the drain to notice.
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		sentAt: timestamp("sent_at"),
		// Same meaning as emailOutbox.skippedReason - stamped alongside sentAt
		// when the row was finished without mailing anything (muted, dead
		// address, season no longer worth announcing).
		skippedReason: text("skipped_reason"),
		attempts: integer("attempts").notNull().default(0),
		lastError: text("last_error"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.seasonId] }),
		index("season_start_emails_pending_idx")
			.on(t.seasonId, t.createdAt)
			.where(sql`sent_at is null`),
	],
)
export type SeasonStartEmail = typeof seasonStartEmails.$inferSelect

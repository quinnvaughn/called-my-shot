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
import { users } from "./users"

// Deliberately mirrors notificationType member-for-member, plus "all". The
// two lists staying identical is what makes a future email type a toggle
// rather than a migration - every in-app notification is a thing we might
// eventually also send mail about, and a divergent second taxonomy would mean
// mapping between them at every gate. Only "call_resolved" actually sends
// today (see lib/email-digest.ts); the rest exist so the opt-out someone sets
// now is still honored when its email ships.
export const emailPreferenceType = pgEnum("email_preference_type", [
	"all",
	"call_resolved",
	"dispute_filed",
	"dispute_upheld",
	"dispute_overturned",
	"question_voided",
	"group_member_joined",
	"question_shared_to_group",
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

import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	username: text("username").notNull().unique(),
	email: text("email").notNull().unique(),
	passwordHash: text("password_hash").notNull(),
	// No real admin/role system yet - this is the first bit of one, just
	// enough to gate posting a question as "official".
	isAdmin: boolean("is_admin").notNull().default(false),
	// Signup doesn't verify email today, so this starts false for everyone -
	// it only flips true once someone completes the change-email confirm flow,
	// which is the first thing that actually proves ownership of an inbox.
	emailVerified: boolean("email_verified").notNull().default(false),
	// Media/pundit badge, set by an admin - unrelated to emailVerified above
	// (that's "proved they own their inbox", this is "we recognize who they are").
	isVerifiedPundit: boolean("is_verified_pundit").notNull().default(false),
	// Set when Resend tells us mail to this address permanently bounced (see
	// lib/email-bounce.ts). Distinct from emailVerified, which is about whether
	// anyone ever confirmed the address: this is "we actually sent, and it came
	// back". Nothing gates sending on it - it drives the banner asking them to
	// fix their address, and confirmEmailChange clears it once they do.
	// A timestamp rather than a boolean so support can see how long it's been
	// broken without a second column.
	emailBouncedAt: timestamp("email_bounced_at"),
	emailBounceReason: text("email_bounce_reason"),
	// Denormalized rather than computed live from question_voids at read time
	// (unlike careerStats/leaderboard rank elsewhere in this schema) because
	// it's read on createQuestion's hot path for every single question post,
	// not just an admin report. Kept in sync transactionally by voidQuestion.
	strikeCount: integer("strike_count").notNull().default(0),
	// Auto-flipped false by voidQuestion only on the transition that crosses
	// the strike threshold (see lib/strikes.ts) - re-enabling it is always an
	// explicit admin action and is never immediately undone by a later void.
	questionCreationEnabled: boolean("question_creation_enabled")
		.notNull()
		.default(true),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})
export type User = typeof users.$inferSelect

export const sessions = pgTable("sessions", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})

// One pending change per user - requesting a new one (or resending) replaces
// whatever was there. Nothing on `users` changes until confirmEmailChange
// consumes the token; current email and current session stay valid the whole
// time this row exists.
export const pendingEmailChanges = pgTable(
	"pending_email_changes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		newEmail: text("new_email").notNull(),
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.userId)],
)
export type PendingEmailChange = typeof pendingEmailChanges.$inferSelect

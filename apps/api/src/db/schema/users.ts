import {
	boolean,
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

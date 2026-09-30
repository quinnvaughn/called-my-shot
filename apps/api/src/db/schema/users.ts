import {
	type AnyPgColumn,
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { flairs } from "./flairs"

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	username: text("username").notNull().unique(),
	email: text("email").notNull().unique(),
	// Null for an account created through Google, which has never had a
	// password. Such an account can still add one from settings.
	passwordHash: text("password_hash"),
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
	// Null means the get-started checklist is still showing on /home. Together
	// with onboardingCollapsedAt and leaderboardViewedAt below, the only
	// onboarding state stored at all: every other step is derived from the
	// user's real calls, groups and email status, so these record what no other
	// row can - what they chose to do with the card, and whether they've been to
	// the leaderboard.
	//
	// Deliberately has no backfill. Every account that predates onboarding
	// starts null and gets the checklist, which is intended rather than an
	// oversight. A timestamp rather than a boolean so support can see when.
	onboardingDismissedAt: timestamp("onboarding_dismissed_at"),
	// Null means the card is expanded. Collapsed is the reversible middle
	// ground between reading the checklist and destroying it: the card shrinks
	// to a single row that still says how far along you are, and dismissing for
	// good is only offered from there. Stored rather than kept in localStorage
	// so the choice follows the account to a second device, the same as the
	// dismissal it sits in front of.
	onboardingCollapsedAt: timestamp("onboarding_collapsed_at"),
	// Null until the user first opens the leaderboard, which is what ticks "See
	// where you rank" on the get-started checklist. Stored because a page visit
	// leaves no other row to derive it from. Keeps the first visit's time; later
	// visits don't move it. No backfill, same as onboardingDismissedAt.
	leaderboardViewedAt: timestamp("leaderboard_viewed_at"),
	// The one flair shown beside this user's name site-wide. Null means none,
	// which is where every account starts - there's no default team to guess.
	//
	// "set null" rather than cascade because retiring a flair should quietly
	// unequip the people wearing it, not touch their accounts. Retirement via
	// flairs.status is the intended path; this covers a genuine hard delete.
	//
	// A pointer rather than a userFlairs column because most equippable flairs
	// have no userFlairs row at all (see flairs.unlock): every team flair is
	// open to everyone, so "what have I got" and "what am I wearing" are
	// genuinely different questions.
	equippedFlairId: uuid("equipped_flair_id").references(
		(): AnyPgColumn => flairs.id,
		{
			onDelete: "set null",
		},
	),
	// R2 object key for the uploaded avatar (see lib/storage.ts). Null means
	// the first-letter fallback. A key rather than a URL so moving the public
	// domain is an env change, not a data migration.
	avatarKey: text("avatar_key"),
	// Same, for the 4:1 banner across the top of their profile. Null means
	// no banner is drawn.
	bannerKey: text("banner_key"),
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

// A sign-in provider identity attached to an account. Matched on the
// provider's stable subject id, never on email: an email can change on either
// side, the subject can't.
export const oauthAccounts = pgTable(
	"oauth_accounts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider", { enum: ["google"] }).notNull(),
		providerUserId: text("provider_user_id").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.provider, t.providerUserId),
		unique().on(t.userId, t.provider),
	],
)
export type OauthAccount = typeof oauthAccounts.$inferSelect

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

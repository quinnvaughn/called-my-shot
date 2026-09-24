import { sql } from "drizzle-orm"
import {
	boolean,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { questionOptions } from "./questions"
import { seasons } from "./sports"
import { users } from "./users"

// A user's personal invite link. Its own table rather than a users column:
// users is selected on every request, in every relation, and by every
// leaderboard, and this is read on exactly one screen. users already carries
// a comment per denormalized column justifying why it earns a place on that
// row (strikeCount: "read on createQuestion's hot path"); an invite code
// fails that test.
//
// Created lazily on first read the same way getOrCreateMemberInvite does for
// groups, so opening the invite screen always has a link to show and no
// backfill is needed for accounts that predate this.
export const referralCodes = pgTable(
	"referral_codes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		code: text("code").notNull().unique(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.userId)],
)
export type ReferralCode = typeof referralCodes.$inferSelect

// How the code reached the invitee. Worth distinguishing: a link that was
// clicked and a code that was typed into the signup form say different things
// about how the invite actually travelled.
export const referralSource = pgEnum("referral_source", [
	"invite_link",
	"manual_code",
])

// pending: signed up through the code, hasn't made a call yet.
// qualified: made their first call, but the referrer's wallet was full. The
//   queue releaseWaitingReferral drains when a redo is spent.
// granted: a redoGrants row exists for it. Terminal.
// rejected: self-referral, or over the season cap. Terminal, and kept rather
//   than deleted so support can answer "why didn't I get my redo".
export const referralStatus = pgEnum("referral_status", [
	"pending",
	"qualified",
	"granted",
	"rejected",
])

// One row per invitee, ever. inviteeId is unique because an account is
// referred by at most one person and that never changes - it is a fact about
// how the account came to exist, not a relationship that can be re-pointed.
//
// status is denormalized state rather than something derived on read, for the
// same reason users.strikeCount is: the one query that needs it ("does this
// referrer have a referral waiting for capacity?") runs inside redoCall's
// transaction, and the derived form is a cross-table anti-join against
// redo_grants with no index that can serve it. castCall and redoCall are the
// only two writers, and both maintain it transactionally.
export const referrals = pgTable(
	"referrals",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		referrerId: uuid("referrer_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		inviteeId: uuid("invitee_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// The code as clicked or typed, snapshotted. Deliberately not a FK to
		// referralCodes: rotating a code that someone farmed shouldn't erase
		// the attribution it legitimately earned before that. Same reasoning
		// as notifications.questionTitle.
		code: text("code").notNull(),
		source: referralSource("source").notNull(),
		status: referralStatus("status").notNull().default("pending"),
		// The season of the question the qualifying call was on, which is what
		// the per-season earn cap counts against. Null until qualified.
		seasonId: uuid("season_id").references(() => seasons.id, {
			onDelete: "set null",
		}),
		// The call that qualified it. Kept for support and for the
		// notification's deep link; nothing depends on it being non-null.
		firstCallId: uuid("first_call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		qualifiedAt: timestamp("qualified_at"),
		// Signup fingerprint, recorded for the abuse review rather than acted
		// on automatically. Text rather than inet: behind Fly's proxy this is
		// a header value, and it can be absent or arrive as a list. Households
		// and campus wifi make a shared address a bad automatic rejection and
		// a good thing to eyeball in a cluster.
		signupIp: text("signup_ip"),
		// Whether the invitee had confirmed their email at the moment this
		// qualified. Not a gate - qualifying is deliberately instant, because
		// the redo is wanted for a game starting in an hour - but it is the
		// column that makes a farm visible, since a farm of throwaway accounts
		// is a cluster of qualified referrals that are false here.
		inviteeVerifiedAtQualify: boolean("invitee_verified_at_qualify"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.inviteeId),
		// The queue redoCall drains. Partial, so it indexes only the handful
		// of referrals actually waiting on capacity rather than every referral
		// ever made.
		index("referrals_waiting_idx")
			.on(t.referrerId, t.qualifiedAt)
			.where(sql`status = 'qualified'`),
		// The invite screen's counts, and the per-season earn cap.
		index("referrals_referrer_idx").on(t.referrerId, t.seasonId),
	],
)
export type Referral = typeof referrals.$inferSelect

// referral: the referrer's side, earned when their invitee makes a first call.
// welcome: the invitee's side, granted the moment they sign up through a link.
//   Both sides get one, which is the whole reason to sign up through someone's
//   link rather than the front door - the referrer gets nothing the invitee
//   didn't also get.
// admin: granted by hand, with a note.
export const redoGrantSource = pgEnum("redo_grant_source", [
	"referral",
	"welcome",
	"admin",
])

// One unconsumed row is one redo in the wallet; a consumed one is the
// receipt. A ledger rather than a counter on users so that "where did this
// redo come from" and "what did I spend it on" are both answerable without a
// second table, and so a grant can never be double-spent: consuming is a
// conditional UPDATE that either takes a row or returns nothing, never a
// decrement that can race.
export const redoGrants = pgTable(
	"redo_grants",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		source: redoGrantSource("source").notNull(),
		// Set for "referral" and "welcome" - one referral mints one of each,
		// to the two different users.
		referralId: uuid("referral_id").references(() => referrals.id, {
			onDelete: "set null",
		}),
		consumedByCallId: uuid("consumed_by_call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		consumedAt: timestamp("consumed_at"),
		// "admin" only - why it was granted by hand.
		note: text("note"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// The balance count and the consume, both of which only ever look at
		// unconsumed rows. Partial, so it stays at most REDO_BALANCE_CAP
		// entries per user however many redos they have spent over time -
		// which is what makes counting the balance live cheap enough that no
		// counter column is needed.
		index("redo_grants_unconsumed_idx")
			.on(t.userId, t.createdAt)
			.where(sql`consumed_at is null`),
		// A referral mints at most one grant per side: a "welcome" to the
		// invitee at signup and a "referral" to the referrer once they call.
		// Keyed on source rather than referral alone precisely because the two
		// sides share a referral row.
		uniqueIndex("redo_grants_referral_source_idx")
			.on(t.referralId, t.source)
			.where(sql`referral_id is not null`),
	],
)
export type RedoGrant = typeof redoGrants.$inferSelect

// What a call looked like before its one redo.
//
// A snapshot beside the call, not a second call row: calls is unique on
// (questionId, userId), and keeping the call's id stable is what keeps
// /calls/:id share links and the og:images third parties have already scraped
// pointing at the same thing.
//
// callId being unique is also the whole of the "one redo per question, ever"
// rule - calls is already one row per user per question, so one redo per call
// is one redo per question.
export const callRedos = pgTable(
	"call_redos",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		callId: uuid("call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		// restrict, not set null: the grant is the receipt proving this redo
		// was paid for, and a redo with no grant behind it would be
		// indistinguishable from one that was never charged.
		grantId: uuid("grant_id")
			.notNull()
			.references(() => redoGrants.id, { onDelete: "restrict" }),
		// The call's original createdAt. Preserved because the redo re-stamps
		// the live column to now, and that re-stamp IS the cost of a redo: it
		// drops the caller to the back of the earliness ranking (see
		// earlinessFor, and numericGuessPoints' own inline earliness). The
		// call page states this alongside the new time, so the page can't look
		// like it is hiding when the first call was really made.
		originalCreatedAt: timestamp("original_created_at").notNull(),
		// numeric_guess shapes only, mirroring calls' own columns.
		originalGuessValue: numeric("original_guess_value", {
			precision: 8,
			scale: 3,
			mode: "number",
		}),
		originalConviction: integer("original_conviction"),
		// The case is the argument for the pick, so a redo replaces it rather
		// than leaving reasoning attached to a pick it no longer argues for.
		// The original is kept here because "here's what they said, here's
		// what they picked instead" is the sharper artifact.
		originalCaseText: text("original_case_text"),
		// Equal to the call's new createdAt by construction. Stored so
		// callCardVersion can bust the unfurl cache off the redo alone,
		// without the call row in hand.
		redoneAt: timestamp("redone_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.callId)],
)
export type CallRedo = typeof callRedos.$inferSelect

// The picks the call had before the redo, shaped exactly like callSelections
// so the two render through the same code. A child table rather than a jsonb
// blob because the dunk needs option labels, which means joining
// questionOptions either way.
export const callRedoSelections = pgTable(
	"call_redo_selections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		redoId: uuid("redo_id")
			.notNull()
			.references(() => callRedos.id, { onDelete: "cascade" }),
		optionId: uuid("option_id")
			.notNull()
			.references(() => questionOptions.id, { onDelete: "cascade" }),
		conviction: integer("conviction").notNull(), // 1-100
	},
	(t) => [unique().on(t.redoId, t.optionId)],
)
export type CallRedoSelection = typeof callRedoSelections.$inferSelect

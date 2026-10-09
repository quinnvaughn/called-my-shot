import { sql } from "drizzle-orm"
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { ballots } from "./ballots"
import { flairs } from "./flairs"
import { questions } from "./questions"
import { leagues } from "./sports"
import { users } from "./users"

export const groupMemberRole = pgEnum("group_member_role", ["admin", "member"])

export const groups = pgTable("groups", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	// Optional pitch shown on the invite page and its link preview. Blank is
	// stored as null, never an empty string.
	description: text("description"),
	// R2 object keys (see lib/storage.ts). Null means no image: the logo falls
	// back to the group's initial and the banner simply isn't drawn.
	logoKey: text("logo_key"),
	bannerKey: text("banner_key"),
	// Nullable + set null on delete: deleting the account that created a group
	// shouldn't take the group (and its other members) down with it.
	createdBy: uuid("created_by").references(() => users.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})
export type Group = typeof groups.$inferSelect

// The leagues a group counts on its leaderboard, activity feeds, and shares.
// No rows means every league, including ones added to the catalog later.
export const groupLeagues = pgTable(
	"group_leagues",
	{
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.groupId, t.leagueId] })],
)

// Socials and websites shown on the group's page. Only the url is stored:
// the platform and icon are read off its hostname at render (describeLink in
// @called-my-shot/schemas), so a platform recognised later applies to links
// saved before it was.
export const groupLinks = pgTable(
	"group_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		url: text("url").notNull(),
		// Null means "label it from the url" - the handle, the platform's name,
		// or the hostname.
		label: text("label"),
		// Display order, as the admin arranged them. Rewritten whole on every
		// save, so it's always 0..n-1.
		position: integer("position").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.groupId, t.url)],
)
export type GroupLink = typeof groupLinks.$inferSelect

export const groupMembers = pgTable(
	"group_members",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: groupMemberRole("role").notNull().default("member"),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
		// Set when this member hides the invite card on the group's page. Per
		// member rather than per group, so one person opting out doesn't stop
		// the card asking everyone else.
		inviteCardDismissedAt: timestamp("invite_card_dismissed_at"),
		// The member whose invite link this person joined through. A user id
		// rather than a group_invites reference: invite rows are deleted when
		// their owner leaves and their codes regenerate in place, while who
		// brought someone in stays true. Null for the creator, for members who
		// joined before this was recorded, and once the inviter's account is
		// deleted.
		invitedById: uuid("invited_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// What this member wears inside this group, overriding whatever they
		// wear site-wide. Null means "use my usual one", which is every member
		// today.
		//
		// Nothing writes this yet. It ships with the first flair migration
		// because per-group flair is a known next step and this is the column
		// that would otherwise force a migration once the table has live rows.
		// Because users.equippedFlairId is never cleared by an override here,
		// showing both chips instead of replacing stays a render decision
		// rather than a data one.
		equippedFlairId: uuid("equipped_flair_id").references(() => flairs.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		unique().on(t.groupId, t.userId),
		// Every "groups this user is in" lookup. The unique constraint leads
		// with group_id, so it can't serve one.
		index("group_members_user_id_idx").on(t.userId),
	],
)

export const groupInvites = pgTable(
	"group_invites",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		code: text("code").notNull().unique(),
		expiresAt: timestamp("expires_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	// one invite link per member per group - resetting it regenerates their
	// own code rather than spawning a second link
	(t) => [unique().on(t.groupId, t.createdBy)],
)

// A member pushing a public question into the group's "Shared" feed. Distinct
// from authorship - sharedBy is whoever sent it, not necessarily the question's
// creator. One share per question per group; re-sharing is a no-op rather than
// bumping it back to the top.
export const questionShares = pgTable(
	"question_shares",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		sharedBy: uuid("shared_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.groupId, t.questionId)],
)
export type QuestionShare = typeof questionShares.$inferSelect

// Questions and ballots a group's admins recommend members call, shown at the
// top of the group page. Each pin is exactly one of the two. Only pins that
// can still be called count toward GROUP_PINS_MAX or show anywhere: a
// question until it locks, a published ballot while any of its members is
// still open. expireGroupPins (lib/group-pins.ts) deletes the rest.
export const groupPins = pgTable(
	"group_pins",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		questionId: uuid("question_id").references(() => questions.id, {
			onDelete: "cascade",
		}),
		ballotId: uuid("ballot_id").references(() => ballots.id, {
			onDelete: "cascade",
		}),
		// Nullable + set null on delete: an admin deleting their account
		// shouldn't unpin what they pinned.
		pinnedBy: uuid("pinned_by").references(() => users.id, {
			onDelete: "set null",
		}),
		// Display order, as the admins arranged it. Not kept contiguous:
		// expiry deletes rows without renumbering, and only the order matters.
		position: integer("position").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.groupId, t.questionId),
		unique().on(t.groupId, t.ballotId),
		index("group_pins_question_id_idx").on(t.questionId),
		index("group_pins_ballot_id_idx").on(t.ballotId),
		check(
			"group_pins_one_target",
			sql`num_nonnulls(${t.questionId}, ${t.ballotId}) = 1`,
		),
	],
)
export type GroupPin = typeof groupPins.$inferSelect

export const groupEventKind = pgEnum("group_event_kind", ["member_joined"])

// An append-only log of what happened in a group. Kept apart from
// group_members because leaving deletes the membership row, and the history
// of who joined, and through whose invite, should outlive it.
export const groupEvents = pgTable(
	"group_events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		kind: groupEventKind("kind").notNull(),
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// member_joined: whose invite link the actor used.
		invitedById: uuid("invited_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [index("group_events_group_created_idx").on(t.groupId, t.createdAt)],
)

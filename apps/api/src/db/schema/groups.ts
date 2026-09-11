import {
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
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
	},
	(t) => [unique().on(t.groupId, t.userId)],
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

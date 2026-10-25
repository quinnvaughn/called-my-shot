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
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { groups } from "./groups"
import { players } from "./players"
import { presserReportReason, presserReportStatus } from "./pressers"
import { leagues } from "./sports"
import { teams } from "./teams"
import { users } from "./users"

// What a post is. Each kind keeps its own content in its own table
// (rushmore_picks for a Rushmore); posts holds what every kind shares, so
// feeds, comments, likes and reports work the same for all of them.
export const postKind = pgEnum("post_kind", ["rushmore"])
export type PostKind = (typeof postKind.enumValues)[number]

// A question people answer with posts: "Celtics Rushmore", "Rushmore of NBA
// point guards". Anyone can start one, and every answer points back at it, so
// "88% have Magic on theirs" counts answers to one prompt rather than matching
// titles. creatorId null is a prompt the app made: one per franchise, seeded
// by db/catalog (see syncRushmorePromptCatalog).
//
// code is the prompt's public address, /rushmore/{code}, printed on share
// images, so it reads as what it is: boston-red-sox for a franchise, the
// title for anyone else's (see lib/prompts/slug.ts).
//
// The prompt's league and team decide who can be picked (the franchise's
// players, anyone who played in the league, or with neither anyone from any
// league) and the tags every answer carries (lib/posts/tags.ts). A team
// always comes with its league. positions (the league's codes) and the
// played-between years narrow the picks further; see lib/prompts/pool.ts.
export const prompts = pgTable(
	"prompts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		kind: postKind("kind").notNull(),
		code: text("code").notNull().unique(),
		creatorId: uuid("creator_id").references(() => users.id, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		leagueId: uuid("league_id").references(() => leagues.id, {
			onDelete: "cascade",
		}),
		teamId: uuid("team_id").references(() => teams.id, {
			onDelete: "cascade",
		}),
		positions: text("positions").array().notNull().default([]),
		// One of PROMPT_COLORS (@called-my-shot/schemas), what its Rushmores are
		// drawn in. Null on a team's prompt, which takes the team's color, and
		// on one made before prompts had colors; promptColor works it out.
		color: text("color"),
		// Calendar years: anyone who played in any of them fits.
		fromYear: integer("from_year"),
		toYear: integer("to_year"),
		// An admin taking it down off a report. Its answers go with it.
		removedAt: timestamp("removed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// One app-made prompt per franchise.
		uniqueIndex("prompts_system_team_idx")
			.on(t.kind, t.teamId)
			.where(sql`${t.creatorId} is null and ${t.teamId} is not null`),
		index("prompts_league_idx").on(t.leagueId),
		check(
			"prompts_team_has_league",
			sql`${t.teamId} is null or ${t.leagueId} is not null`,
		),
		check(
			"prompts_positions_have_league",
			sql`cardinality(${t.positions}) = 0 or ${t.leagueId} is not null`,
		),
		check(
			"prompts_years_in_order",
			sql`${t.fromYear} is null or ${t.toYear} is null or ${t.fromYear} <= ${t.toYear}`,
		),
	],
)
export type Prompt = typeof prompts.$inferSelect

// One person's answer to a prompt. groupId null is public: it shows in every
// space it's tagged with, on the author's profile, and can be shared off the
// app. A group post is only ever seen inside that group and in its members'
// Home feeds.
//
// A person gets one public answer per prompt and one per group per prompt -
// a second Rushmore of the same thing is a change of mind, which is a delete
// and a new one. body is editable after posting (editedAt); what was picked
// is not, so the crowd numbers never count a pick that's gone.
export const posts = pgTable(
	"posts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		authorId: uuid("author_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: postKind("kind").notNull(),
		promptId: uuid("prompt_id")
			.notNull()
			.references(() => prompts.id, { onDelete: "cascade" }),
		groupId: uuid("group_id").references(() => groups.id, {
			onDelete: "cascade",
		}),
		body: text("body"),
		editedAt: timestamp("edited_at"),
		// An admin taking it down off a report. The content stays for the
		// report's record.
		removedAt: timestamp("removed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("posts_public_answer_idx")
			.on(t.authorId, t.promptId)
			.where(sql`${t.groupId} is null`),
		uniqueIndex("posts_group_answer_idx")
			.on(t.authorId, t.promptId, t.groupId)
			.where(sql`${t.groupId} is not null`),
		index("posts_created_idx").on(t.createdAt, t.id),
		index("posts_prompt_idx").on(t.promptId, t.createdAt),
		index("posts_author_idx").on(t.authorId, t.createdAt),
		index("posts_group_idx")
			.on(t.groupId, t.createdAt)
			.where(sql`${t.groupId} is not null`),
	],
)
export type Post = typeof posts.$inferSelect

// The four faces on a Rushmore. There's no #1: position is only where the
// author put them, left to right, for the art.
export const rushmorePicks = pgTable(
	"rushmore_picks",
	{
		postId: uuid("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.postId, t.playerId] }),
		unique().on(t.postId, t.position),
		index("rushmore_picks_player_idx").on(t.playerId),
		check("rushmore_picks_position", sql`${t.position} between 0 and 3`),
	],
)
export type RushmorePick = typeof rushmorePicks.$inferSelect

// The spaces a post shows up in. Nobody picks these: lib/posts/tags.ts works
// them out when the post is written and they never change after, so a post
// about a player stays a post about the team he played for at the time.
//
// subject is what the post is about, and carries everything above it (a
// Celtics Rushmore is a Celtics post and an NBA post). mention is something
// it names along the way: each player on a Rushmore. Mentions don't pull in
// their parents, or every Celtics Rushmore with Garnett on it would land in
// the Timberwolves' space too.
//
// spaceId points into leagues, teams or players depending on spaceKind, so
// there's no FK - the same trade-off as external_refs.entityId.
export const spaceKind = pgEnum("space_kind", ["league", "team", "player"])
export type SpaceKind = (typeof spaceKind.enumValues)[number]

export const postTagRole = pgEnum("post_tag_role", ["subject", "mention"])
export type PostTagRole = (typeof postTagRole.enumValues)[number]

export const postTags = pgTable(
	"post_tags",
	{
		postId: uuid("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		spaceKind: spaceKind("space_kind").notNull(),
		spaceId: uuid("space_id").notNull(),
		role: postTagRole("role").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.postId, t.spaceKind, t.spaceId] }),
		index("post_tags_space_idx").on(t.spaceKind, t.spaceId),
	],
)
export type PostTag = typeof postTags.$inferSelect

export const postLikes = pgTable(
	"post_likes",
	{
		postId: uuid("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.postId, t.userId] }),
		index("post_likes_user_idx").on(t.userId),
	],
)

// A report on a post. Shares the presser report reasons and statuses, like
// comment_reports. An admin acting on one can take down the post, or the
// whole prompt when the problem is its title.
export const postReports = pgTable(
	"post_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterId: uuid("reporter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		postId: uuid("post_id")
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		reason: presserReportReason("reason").notNull(),
		details: text("details"),
		status: presserReportStatus("status").notNull().default("open"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		reviewedAt: timestamp("reviewed_at"),
		reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		unique().on(t.reporterId, t.postId),
		index("post_reports_status_idx").on(t.status, t.createdAt),
	],
)
export type PostReport = typeof postReports.$inferSelect

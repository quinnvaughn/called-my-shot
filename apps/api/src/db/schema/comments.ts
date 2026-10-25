import { sql } from "drizzle-orm"
import {
	type AnyPgColumn,
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
import { chains } from "./chains"
import { challengeAcceptances, challenges } from "./challenges"
import { posts } from "./posts"
import { presserReportReason, presserReportStatus } from "./pressers"
import { users } from "./users"

// What a comment was posted on, and under which rules.
// challenge_creator: a challenge creator's gloat, to every acceptor they beat.
// challenge_acceptor: an acceptor's gloat, to the creator they beat.
// chain: a post in a chain's thread, from anyone in the chain's group.
// post: a comment or reply on a post (a Rushmore), from anyone who can see it.
export const commentKind = pgEnum("comment_kind", [
	"challenge_creator",
	"challenge_acceptor",
	"chain",
	"post",
])
export type CommentKind = (typeof commentKind.enumValues)[number]

export const gifProvider = pgEnum("gif_provider", ["klipy"])

// Someone's own words, a GIF, or both, posted on one thing. Never edited -
// removedAt is an admin taking it down off a report, and the content stays
// for the report's record.
//
// Exactly one of the target columns is set. A gloat is a comment with the
// challenge rules on top (one per sender per 1v1, winners only - see
// lib/challenges/gloat.ts); a chain's thread takes as many as people post.
//
// A post's comments go two levels deep and no further. parentId is the
// top-level comment a reply sits under, never another reply: answering a
// reply stays at the second level and names who it's answering in
// replyToUserId.
export const comments = pgTable(
	"comments",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		senderId: uuid("sender_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: commentKind("kind").notNull(),
		challengeId: uuid("challenge_id").references(() => challenges.id, {
			onDelete: "cascade",
		}),
		// The 1v1 an acceptor's gloat is about. Null on the creator's, which
		// covers every acceptor they beat.
		acceptanceId: uuid("acceptance_id").references(
			() => challengeAcceptances.id,
			{ onDelete: "cascade" },
		),
		chainId: uuid("chain_id").references(() => chains.id, {
			onDelete: "cascade",
		}),
		postId: uuid("post_id").references(() => posts.id, {
			onDelete: "cascade",
		}),
		parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
			onDelete: "cascade",
		}),
		replyToUserId: uuid("reply_to_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
		text: text("text"),
		gifProvider: gifProvider("gif_provider"),
		gifId: text("gif_id"),
		gifUrl: text("gif_url"),
		gifWidth: integer("gif_width"),
		gifHeight: integer("gif_height"),
		gifAlt: text("gif_alt"),
		removedAt: timestamp("removed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// One gloat per sender per 1v1. The creator's has no acceptance, and
		// it still has to be one.
		uniqueIndex("comments_challenge_sender_idx")
			.on(
				t.challengeId,
				t.senderId,
				sql`coalesce(${t.acceptanceId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
			)
			.where(sql`${t.challengeId} is not null`),
		index("comments_chain_created_idx")
			.on(t.chainId, t.createdAt)
			.where(sql`${t.chainId} is not null`),
		check(
			"comments_has_content",
			sql`${t.text} is not null or ${t.gifUrl} is not null`,
		),
		index("comments_post_parent_created_idx")
			.on(t.postId, t.parentId, t.createdAt)
			.where(sql`${t.postId} is not null`),
		check(
			"comments_one_target",
			sql`num_nonnulls(${t.challengeId}, ${t.chainId}, ${t.postId}) = 1`,
		),
		check(
			"comments_threads_on_posts_only",
			sql`${t.postId} is not null or (${t.parentId} is null and ${t.replyToUserId} is null)`,
		),
	],
)
export type Comment = typeof comments.$inferSelect

// A report on a comment. Shares the presser report reasons and statuses: an
// admin acting on either can take the content down.
export const commentReports = pgTable(
	"comment_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterId: uuid("reporter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		commentId: uuid("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
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
		unique().on(t.reporterId, t.commentId),
		index("comment_reports_status_idx").on(t.status, t.createdAt),
	],
)
export type CommentReport = typeof commentReports.$inferSelect

export const commentLikes = pgTable(
	"comment_likes",
	{
		commentId: uuid("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.commentId, t.userId] })],
)

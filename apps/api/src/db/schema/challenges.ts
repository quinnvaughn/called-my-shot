import {
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { groups } from "./groups"
import { questions } from "./questions"
import { users } from "./users"

// A set of questions someone dares people to call against them, shared by
// link. Everyone who accepts is a separate 1v1 against the creator, decided
// by challenge points (see calls.challengePoints) summed over the questions.
//
// There's no status or close column: a challenge takes new people until its
// first question locks, and settles once every question in it has a result,
// both read off the questions themselves (see lib/challenges/outcome.ts) so
// a rescheduled game or an overturned result is reflected without anything
// to keep in step.
export const challenges = pgTable(
	"challenges",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		// The short code in the link - see lib/invite-codes.ts.
		code: text("code").notNull().unique(),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [index("challenges_creator_id_idx").on(t.creatorId, t.createdAt)],
)
export type Challenge = typeof challenges.$inferSelect

// Fixed at creation: adding a question later would leave everyone who
// already accepted without a call on it.
export const challengeQuestions = pgTable(
	"challenge_questions",
	{
		challengeId: uuid("challenge_id")
			.notNull()
			.references(() => challenges.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.challengeId, t.questionId] }),
		index("challenge_questions_question_id_idx").on(t.questionId),
	],
)

// One person taking the creator on. creatorGloatSentAt is when the creator's
// gloat reached this acceptor: it's stamped per row rather than read off the
// gloat's own time because an overturn can hand the creator a win over
// someone after they've already gloated, and that person should still get it.
export const challengeAcceptances = pgTable(
	"challenge_acceptances",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		challengeId: uuid("challenge_id")
			.notNull()
			.references(() => challenges.id, { onDelete: "cascade" }),
		acceptorId: uuid("acceptor_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		creatorGloatSentAt: timestamp("creator_gloat_sent_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.challengeId, t.acceptorId),
		index("challenge_acceptances_acceptor_id_idx").on(t.acceptorId),
	],
)
export type ChallengeAcceptance = typeof challengeAcceptances.$inferSelect

// A challenge posted into a group, which puts it on the group's Home.
export const challengeGroupPosts = pgTable(
	"challenge_group_posts",
	{
		challengeId: uuid("challenge_id")
			.notNull()
			.references(() => challenges.id, { onDelete: "cascade" }),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		postedById: uuid("posted_by_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.challengeId, t.groupId] }),
		index("challenge_group_posts_group_idx").on(t.groupId, t.createdAt),
	],
)

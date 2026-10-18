import { sql } from "drizzle-orm"
import {
	index,
	numeric,
	pgEnum,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { games } from "./games"
import { groups } from "./groups"
import { questions } from "./questions"
import { users } from "./users"

// requested: waiting on the starter. approved: in the chain. declined: the
// starter said no, and the same person can't ask this chain again. left: the
// member pulled out before lock. released: the chain was called off with the
// link still in it. Only requested and approved hold the call; every other
// status frees it for another chain while keeping the row for the thread.
export const chainLinkStatus = pgEnum("chain_link_status", [
	"requested",
	"approved",
	"declined",
	"left",
	"released",
])
export type ChainLinkStatus = (typeof chainLinkStatus.enumValues)[number]

export const chainOutcome = pgEnum("chain_outcome", ["held", "broken"])
export type ChainOutcome = (typeof chainOutcome.enumValues)[number]

// A set of calls from different members of one group that all have to hit -
// see computeChain in @called-my-shot/scoring for what it awards.
//
// Like a challenge, there's no status column for where it stands. A chain
// takes links until the first of its links' questions locks, and its result
// is read off those questions (see lib/chains/state.ts), so a rescheduled
// game or an overturned result is reflected with nothing to keep in step.
// The two announced* columns aren't state: they're what members were last
// told, so a rebuild that lands on the same result doesn't tell them again.
export const chains = pgTable(
	"chains",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		groupId: uuid("group_id")
			.notNull()
			.references(() => groups.id, { onDelete: "cascade" }),
		// Set null rather than cascaded: the starter deleting their account
		// shouldn't take everyone else's chain with it.
		starterId: uuid("starter_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		// The starter calling it off before lock. The row stays so the thread
		// can say so.
		cancelledAt: timestamp("cancelled_at"),
		announcedOutcome: chainOutcome("announced_outcome"),
		announcedBreakerLinkId: uuid("announced_breaker_link_id"),
	},
	(t) => [index("chains_group_created_idx").on(t.groupId, t.createdAt)],
)
export type Chain = typeof chains.$inferSelect

// One member's call in a chain, from the moment they ask to add it.
// questionId and gameId are copied off the call so the one-per-question and
// one-per-game rules can be unique indexes.
export const chainLinks = pgTable(
	"chain_links",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		chainId: uuid("chain_id")
			.notNull()
			.references(() => chains.id, { onDelete: "cascade" }),
		callId: uuid("call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		// The link's chance of hitting, read when it was asked for and again
		// when it was approved (see chainHitChance). It can't move after that: a
		// question's price stops moving once anyone has called it, and a call
		// in a chain can't be redone.
		hitChance: numeric("hit_chance", {
			precision: 4,
			scale: 3,
			mode: "number",
		}).notNull(),
		status: chainLinkStatus("status").notNull().default("requested"),
		requestedAt: timestamp("requested_at").notNull().defaultNow(),
		// When the starter approved or declined it. The starter's own link is
		// approved as the chain is made.
		decidedAt: timestamp("decided_at"),
		// When it stopped holding its call: left, or released by a call-off.
		leftAt: timestamp("left_at"),
	},
	(t) => [
		uniqueIndex("chain_links_active_call_idx")
			.on(t.callId)
			.where(sql`status in ('requested', 'approved')`),
		uniqueIndex("chain_links_active_member_idx")
			.on(t.chainId, t.userId)
			.where(sql`status in ('requested', 'approved')`),
		uniqueIndex("chain_links_question_idx")
			.on(t.chainId, t.questionId)
			.where(sql`status = 'approved'`),
		uniqueIndex("chain_links_game_idx")
			.on(t.chainId, t.gameId)
			.where(sql`status = 'approved'`),
		index("chain_links_chain_idx").on(t.chainId),
		index("chain_links_question_id_idx").on(t.questionId),
		index("chain_links_user_idx").on(t.userId),
	],
)
export type ChainLink = typeof chainLinks.$inferSelect

// Chains whose links' results moved, waiting on a rebuild - see
// lib/chains/drain.ts. Same shape and guard as streak_recompute_queue.
export const chainRecomputeQueue = pgTable("chain_recompute_queue", {
	chainId: uuid("chain_id")
		.primaryKey()
		.references(() => chains.id, { onDelete: "cascade" }),
	dirtiedAt: timestamp("dirtied_at").notNull().defaultNow(),
})

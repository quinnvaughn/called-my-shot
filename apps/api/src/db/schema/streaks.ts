import {
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { leagues, seasons } from "./sports"
import { users } from "./users"

// Same values as STREAK_FAMILIES in @called-my-shot/scoring, which also maps
// each question shape to one of these.
export const streakFamily = pgEnum("streak_family", [
	"winners",
	"totals",
	"props",
	"numeric",
])

// Everything below is a cache, rebuilt from calls by lib/streaks/recompute.ts
// whenever a question that counts toward it settles, is voided or is deleted.
// Nothing here is ever incremented in place, so a dispute overturn or a void
// in the middle of a run is just another rebuild, and the whole set can be
// truncated and refilled by the backfill.

// One row per (user, league, family) with at least one counted call. A run is
// named by its first and last call; the lengths are what every read shows.
export const userStreaks = pgTable(
	"user_streaks",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		family: streakFamily("family").notNull(),
		// Zero when the most recent counted call was a miss.
		currentLength: integer("current_length").notNull().default(0),
		currentStartCallId: uuid("current_start_call_id").references(
			() => calls.id,
			{ onDelete: "set null" },
		),
		currentEndCallId: uuid("current_end_call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		bestLength: integer("best_length").notNull().default(0),
		bestStartCallId: uuid("best_start_call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		bestEndCallId: uuid("best_end_call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		// When the best run's last result landed.
		bestEndedAt: timestamp("best_ended_at"),
		// When the track's most recent counted result landed - what decides
		// whether a change is fresh enough to notify about.
		lastSettledAt: timestamp("last_settled_at"),
		computedAt: timestamp("computed_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.leagueId, t.family] })],
)
export type UserStreak = typeof userStreaks.$inferSelect

// How long its track's run was once this call landed, for every counted win.
// A table of its own rather than a column on calls, so the cache can be
// rebuilt without writing to calls at all.
export const callStreakPositions = pgTable(
	"call_streak_positions",
	{
		callId: uuid("call_id")
			.primaryKey()
			.references(() => calls.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		family: streakFamily("family").notNull(),
		length: integer("length").notNull(),
	},
	(t) => [
		index("call_streak_positions_track_idx").on(t.userId, t.leagueId, t.family),
	],
)
export type CallStreakPosition = typeof callStreakPositions.$inferSelect

// One row per user who called every game's winner in a finished slate right.
// slateKey is built by buildSlateKey in lib/streaks/slate.ts and carries the
// week, slot or day the slate covers.
export const userSweeps = pgTable(
	"user_sweeps",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		slateKey: text("slate_key").notNull(),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		// Games counted, after any voided winner question is dropped.
		gameCount: integer("game_count").notNull(),
		firstStartsAt: timestamp("first_starts_at").notNull(),
		// When the slate's last counted game went final.
		settledAt: timestamp("settled_at").notNull(),
		computedAt: timestamp("computed_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.leagueId, t.slateKey] }),
		index("user_sweeps_user_settled_idx").on(t.userId, t.settledAt),
	],
)
export type UserSweep = typeof userSweeps.$inferSelect

// Tracks and slates waiting to be rebuilt. Written inside whatever transaction
// settled a question, drained by lib/streaks/drain.ts. Keyed on what gets
// rebuilt rather than on the question, so a game going final that settles a
// dozen questions for one caller still rebuilds that caller's track once, and
// a hard-deleted question can't cascade its pending rebuild away.
export const streakRecomputeQueue = pgTable(
	"streak_recompute_queue",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		family: streakFamily("family").notNull(),
		// Bumped on every re-mark. The drain only deletes a row still carrying
		// the value it read, so a mark that lands mid-rebuild isn't lost.
		dirtiedAt: timestamp("dirtied_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.leagueId, t.family] })],
)

export const sweepRecomputeQueue = pgTable(
	"sweep_recompute_queue",
	{
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		slateKey: text("slate_key").notNull(),
		dirtiedAt: timestamp("dirtied_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.leagueId, t.slateKey] })],
)

import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { games } from "./games"
import { leagues, seasons } from "./sports"
import { users } from "./users"

// streak_milestone: every STREAK_BONUS_STEP wins in a row on one streak track.
// sweep: every winner in a slate called right.
// chain: what a chain added to or took back from a member's link.
export const pointAwardKind = pgEnum("point_award_kind", [
	"streak_milestone",
	"sweep",
	"chain",
])
export type PointAwardKind = (typeof pointAwardKind.enumValues)[number]

// Points earned outside a call's own result. Each row is one award, so "where
// did these points come from" is always answerable, and each one is also
// summed into user_season_stats.bonusPoints for the season it's filed under,
// which is what leaderboards read.
//
// Written only by lib/point-awards.ts's reconcileAwards, which takes
// everything one scope should hold right now and diffs it against what's
// here. An award follows the result it was earned from: a void or a dispute
// overturn that shortens a streak or breaks a sweep takes the points back on
// the next rebuild. That's the opposite of userFlairs, which keeps a grant
// once earned - a flair is a keepsake, points are the standings.
export const pointAwards = pgTable(
	"point_awards",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		kind: pointAwardKind("kind").notNull(),
		// What one rebuild owns - see pointAwardScope in lib/point-awards.ts.
		// Text rather than foreign keys because each kind's scope is a
		// different thing (a streak track, a slate), and a hard delete of a
		// question behind an award has to leave the row for the rebuild to find
		// and reverse, not cascade it away with the points still counted.
		scopeKey: text("scope_key").notNull(),
		// Which award within the scope: the run and milestone for a streak, the
		// user for a sweep or a chain.
		sourceKey: text("source_key").notNull(),
		points: integer("points").notNull(),
		// The game the award is dated by, which is how a report card window
		// claims it: for a streak, the game of the call that reached the
		// milestone; for a sweep, the slate's last game. Every game of a slate
		// sits in the same window, so which one doesn't change where it lands.
		// For a chain, the game of the member's own link.
		// Set null rather than cascaded on delete, for the same reason scopeKey
		// is text: the rebuild has to find the row to reverse it.
		gameId: uuid("game_id").references(() => games.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.kind, t.scopeKey, t.sourceKey),
		index("point_awards_user_idx").on(t.userId, t.createdAt),
		index("point_awards_user_game_idx").on(t.userId, t.gameId),
	],
)
export type PointAward = typeof pointAwards.$inferSelect

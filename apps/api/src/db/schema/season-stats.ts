import { index, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core"
import { leagues, seasons } from "./sports"
import { users } from "./users"

// Denormalized per-(user, season) rollup - the only source leaderboards/
// career stats read from (see lib/points-aggregate.ts), rather than
// aggregating live over calls/callSelections on every read. One row per
// season a user has ever cast a call in; kept in sync transactionally by
// castCall (callCount +1 on cast), resolveQuestionInternal (points/
// resolvedCallCount/correctCount deltas on resolve, delta not overwrite, so
// a dispute overturn re-resolving a question doesn't double-count), and
// voidQuestion (reverses all four fields for every call on the voided
// question - callCount always, the others only when calls had already been
// scored, i.e. a disputed question being voided).
//
// Deliberately NOT a `points` column on `users` for the site-wide total -
// that would mean an independently-updated running total that could drift
// from this table if some future write path updates one and forgets the
// other. All-time and per-league totals are both just sum(points) grouped by
// user_id over this table (all-time: no league_id filter; one league: filter
// it) - cheap regardless of a user's call count because this table's size is
// bounded by leagues x seasons (an admin-curated catalog, realistically a
// couple dozen leagues x a handful of seasons each at most - see
// graphql/types/sports/mutations.ts's createLeague), not by call volume.
// leagueId is denormalized directly rather than derived via a join through
// seasons, matching how questions.leagueId itself is stored directly rather
// than derived via game.leagueId - keeps the common "all-time within one
// league" query a plain WHERE, no join.
//
// seasonId is NOT NULL: every league this app supports is ESPN-covered, and
// run.ts's sync loop syncs a league's seasons before its games/before it's
// usable for question creation at all, so a resolvable season is as
// reliable as leagueId already is in practice. The rare case a question's
// seasonId can't be resolved (a brief sync-lag window right at a season
// boundary) simply isn't written here at all - see the seasonId-guarded call
// sites in graphql/types/question/ and lib/resolve-question.ts.
export const userSeasonStats = pgTable(
	"user_season_stats",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		points: integer("points").notNull().default(0),
		// Counts picks, not calls, for multi_select (matches scoreCalls'
		// pre-existing semantics) - one multi_select call with 3 resolved
		// selections adds 3 here, not 1.
		resolvedCallCount: integer("resolved_call_count").notNull().default(0),
		correctCount: integer("correct_count").notNull().default(0),
		// Unlike the three fields above, this counts calls (one per cast),
		// incremented at castCall time regardless of resolution status.
		callCount: integer("call_count").notNull().default(0),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.seasonId] }),
		index("user_season_stats_league_points_idx").on(t.leagueId, t.points),
	],
)
export type UserSeasonStats = typeof userSeasonStats.$inferSelect

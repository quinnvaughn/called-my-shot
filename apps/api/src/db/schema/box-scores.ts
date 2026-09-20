import {
	boolean,
	index,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { games } from "./games"
import { players } from "./players"
import { leagues, seasons } from "./sports"
import { syncSource } from "./sync"
import { teams } from "./teams"

// Every numeric cell of every final box score, stored under ESPN's own raw
// column key rather than a catalog stats.id. Catalog stats cover a fraction of
// what a box score carries, and normalizing on write would throw the rest away
// - including the columns opponent-allowed and share-of-team numbers are built
// from. The catalog stat a question asks about is resolved to one of these raw
// keys at read time, through the `source` descriptors on the extractors in
// lib/auto-resolve/registry.ts, which is the one place that mapping lives.
//
// !! A key that looks per-game is not always per-game. ESPN's MLB box score
// reports batting.avg, batting.onBasePct, batting.slugAvg, pitching.ERA and
// pitching.WHIP as SEASON-TO-DATE, and they are stored here verbatim like
// everything else. Never read a rate column off this table directly. Go
// through the registry, where those five stats deliberately carry no `source`
// for exactly this reason (see mlbBatterGameStat / mlbPitchingRate).

// Which map in a parsed box score a team-level row came out of. The two are
// separate key namespaces and must not be conflated: NBA team rebounds are
// "totalRebounds" in the team box but "rebounds" in the player tables, and
// NFL team passing is "netPassingYards" (net of sacks) against a player's
// gross "passing.passingYards". Share-of-team-total needs the player-table
// totals specifically, because ESPN's printed totals include production
// credited to no individual and so don't equal the sum of the player rows.
export const teamGameStatScope = pgEnum("team_game_stat_scope", [
	"team_box",
	"player_table_total",
	// The final score, which is not a box-score cell at all - ESPN carries it
	// on the competitor. Stored here anyway, under the key "score", so a
	// question about a team's points is just another team stat and needs no
	// special path through the query layer.
	"final_score",
])

// Columns every box-score row carries so the aggregate queries stay
// single-table. All of them are derivable by joining games, and all of them
// are denormalized anyway: the read patterns are "this player's last N", "what
// this opponent has allowed this season" and "home vs away", each of which
// would otherwise pay for a join on every row it scans.
const context = {
	gameId: uuid("game_id")
		.notNull()
		.references(() => games.id, { onDelete: "cascade" }),
	source: syncSource("source").notNull(),
	teamId: uuid("team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "restrict" }),
	opponentTeamId: uuid("opponent_team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "restrict" }),
	isHome: boolean("is_home").notNull(),
	// games.startsAt, copied. Orders "last N" and enforces the as-of cutoff
	// that keeps a resolved question's page showing the pregame picture.
	gameDate: timestamp("game_date").notNull(),
	seasonId: uuid("season_id")
		.notNull()
		.references(() => seasons.id, { onDelete: "restrict" }),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "cascade" }),
	// ESPN's raw column key, verbatim - "points", "batting.hits",
	// "pitching.fullInnings.partInnings". Opaque, and note it can itself
	// contain dots, so it is never parsed apart.
	statKey: text("stat_key").notNull(),
	// Exactly what ESPN printed ("2-5", "5.2", "--"), kept so a stored box
	// score can always be re-derived without re-fetching.
	valueText: text("value_text").notNull(),
	// The number the aggregates read, parsed by the same function resolution
	// uses for this key (a made-attempted pair yields the made count, MLB
	// innings yield thirds), so this column can never disagree with how a
	// question on the same stat was settled. Null when the cell holds no
	// number at all.
	valueNumeric: numeric("value_numeric", {
		precision: 10,
		scale: 3,
		mode: "number",
	}),
}

export const playerGameStats = pgTable(
	"player_game_stats",
	{
		...context,
		// The scoped external_refs form, "<leagueSlug>:<espnAthleteId>". This is
		// part of the primary key rather than playerId because playerId is
		// nullable and Postgres treats NULLs as distinct - a null playerId in the
		// key would make every unlinked athlete's rows re-insert on each refresh
		// instead of replacing. A sync artifact table knowing about scoped ESPN
		// ids is a deliberate exception to the rule that domain tables don't (see
		// external_refs in sync.ts).
		sourceAthleteId: text("source_athlete_id").notNull(),
		// Null when ESPN lists an athlete the daily roster sync hasn't picked up
		// yet, same case as gameStarters.playerId. The row is still written and
		// still counts toward team-level and opponent-allowed totals; it only
		// drops out of position-filtered numbers, which is correct, since an
		// unlinked athlete has no known position. A later refresh fills it in.
		playerId: uuid("player_id").references(() => players.id, {
			onDelete: "set null",
		}),
		// Duplicated across all of one athlete's rows for a game. A byte each,
		// and it earns that by keeping every filter single-table.
		didNotPlay: boolean("did_not_play").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.gameId, t.sourceAthleteId, t.statKey] }),
		// Recent form, season-to-date, both splits, and the share numerator.
		index("player_game_stats_player_stat_date_idx").on(
			t.playerId,
			t.statKey,
			t.gameDate.desc(),
		),
		// Opponent-allowed and the league-wide rank behind it.
		index("player_game_stats_opponent_stat_date_idx").on(
			t.opponentTeamId,
			t.statKey,
			t.gameDate.desc(),
		),
		index("player_game_stats_team_stat_date_idx").on(
			t.teamId,
			t.statKey,
			t.gameDate.desc(),
		),
	],
)
export type PlayerGameStat = typeof playerGameStats.$inferSelect

export const teamGameStats = pgTable(
	"team_game_stats",
	{
		...context,
		scope: teamGameStatScope("scope").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.gameId, t.teamId, t.scope, t.statKey] }),
		index("team_game_stats_team_scope_stat_date_idx").on(
			t.teamId,
			t.scope,
			t.statKey,
			t.gameDate.desc(),
		),
		index("team_game_stats_opponent_scope_stat_date_idx").on(
			t.opponentTeamId,
			t.scope,
			t.statKey,
			t.gameDate.desc(),
		),
	],
)
export type TeamGameStat = typeof teamGameStats.$inferSelect

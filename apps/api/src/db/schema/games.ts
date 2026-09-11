import {
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { leagues, seasons } from "./sports"
import { teams } from "./teams"

// A single real-world matchup - what a yes_no/over_under/numeric_guess
// question about one specific game anchors to instead of just baking
// "Team A @ Team B" into its title as unstructured text. Not every question
// has one - season-long questions (a championship, an MVP race) leave
// questions.gameId null. home/away, not a symmetric "teamA/teamB" pair - the
// "@" convention (away @ home) is what the title text and UI both read off.
// Kept current by db/sync/sync-live-scores.ts (see that file) for any game
// ESPN is tracking; an admin can still set this by hand on the Data tab via
// UpdateGameInput for anything outside that (a manually-entered game, or a
// correction). homeScore/awayScore are only meaningful once "final".
export const gameStatus = pgEnum("game_status", ["scheduled", "live", "final"])

// Regular season vs. postseason - not derivable from seasonId alone at query
// time without a join back to seasons' date ranges, and needed on the game
// row itself so a week-window league's window key (seasonType + weekNumber)
// can't collide a week-1 regular-season game with a week-1 playoff game.
export const gameSeasonType = pgEnum("game_season_type", [
	"regular",
	"postseason",
])

// One row per week of a week-window league's season (NFL), synced verbatim
// from ESPN's own season calendar - the authoritative answer to "when does
// week N start and end", which is NOT derivable from the week's games:
// ESPN's NFL week runs Wednesday 3am ET to the following Wednesday 2:59am
// ET, so the Tuesday after Monday Night Football is still the old week and
// the Wednesday before Thursday Night Football is already the new one.
// Deriving the range from the games instead (first kickoff to last kickoff)
// leaves real gaps between weeks where no window contains "now" at all -
// see getLeagueWindows in graphql/types/sports/windows.ts, which reads these.
// (seasonType, weekNumber) matches games.seasonType/games.weekNumber
// exactly, since both come from the same ESPN response - a postseason week
// 1 is a different row from a regular-season week 1, same as on games.
// Only synced for leagues whose windowType is "week"; every other league
// has no week concept to record.
export const seasonWeeks = pgTable(
	"season_weeks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		seasonType: gameSeasonType("season_type").notNull(),
		weekNumber: integer("week_number").notNull(),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at").notNull(),
	},
	(t) => [unique().on(t.seasonId, t.seasonType, t.weekNumber)],
)
export type SeasonWeek = typeof seasonWeeks.$inferSelect

export const games = pgTable("games", {
	id: uuid("id").primaryKey().defaultRandom(),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "cascade" }),
	// Which real-world season this game belongs to, resolved by the sync
	// against seasons' date ranges (see db/sync/sync-games.ts). Restrict, not
	// cascade/set null - a season with games synced under it shouldn't be
	// deletable out from under them.
	seasonId: uuid("season_id")
		.notNull()
		.references(() => seasons.id, { onDelete: "restrict" }),
	homeTeamId: uuid("home_team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "restrict" }),
	awayTeamId: uuid("away_team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "restrict" }),
	startsAt: timestamp("starts_at").notNull(),
	status: gameStatus("status").notNull().default("scheduled"),
	homeScore: integer("home_score"),
	awayScore: integer("away_score"),
	seasonType: gameSeasonType("season_type").notNull().default("regular"),
	// ESPN's own week number, stored verbatim - never derived, so leagues that
	// carve up their season into byes/playoff rounds stay correct with zero
	// date-arithmetic on our side. Null for date-window leagues (MLB/NBA),
	// which don't have a week concept at all.
	weekNumber: integer("week_number"),
	// A raw, league-owned machine key ("THU", "SUN_EARLY", ...) - deliberately
	// plain text, not an enum. This is NFL's own broadcast-window vocabulary,
	// not a shared cross-league concept the way windowType/seasonType above
	// are; a pg enum here would force every future week-window league to
	// share NFL's slot values or fight the type. The valid keys and their
	// display labels are owned by each league's own sync module (see
	// db/sync/nfl-slot.ts), never by the schema. Null for any league/game with
	// no slot concept.
	slot: text("slot"),
	// The specific game's location, not the home team's usual park - a team's
	// normal venue and this game's actual one aren't always the same thing
	// (neutral-site games, international series), so this lives on the game,
	// not on teams. Synced from ESPN's per-event venue - see db/sync/sync-games.ts.
	// Nullable: games synced before this column existed have no value until
	// their next sync pass.
	venue: text("venue"),
	// When db/sync/sync-game-starters.ts last fully refreshed this game's
	// starters - how that job tells a game is due again without re-fetching
	// ESPN every tick. Null until the first successful refresh.
	startersSyncedAt: timestamp("starters_synced_at"),
})
export type Game = typeof games.$inferSelect

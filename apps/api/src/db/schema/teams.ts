import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { leagues, seasons } from "./sports"

export const teams = pgTable(
	"teams",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		name: text("name").notNull(), // "Boston Celtics"
		abbreviation: text("abbreviation").notNull(), // "BOS"
		color: text("color").notNull(), // primary brand color, hex - powers badges/borders in the UI
		// "AL"/"NL", "AFC"/"NFC", "Eastern"/"Western" - freetext, varies too much
		// by sport for an enum (same reasoning as players.position in ./players).
		// Synced from ESPN's groups endpoint (see db/sync/sync-teams.ts),
		// hand-editable after that the same way color is. Null for a league with
		// no split.
		conference: text("conference"),
		// Nested under conference - "AFC South", "Atlantic". Same sync/edit story
		// as conference. Null for a league with conferences but no further split,
		// or no split at all.
		division: text("division"),
		// The team's logo on its own league's CDN, same sync and fallback story
		// as players.headshotUrl.
		logoUrl: text("logo_url"),
	},
	(t) => [unique().on(t.leagueId, t.abbreviation)],
)
export type Team = typeof teams.$inferSelect

// A team's win-loss(-tie) record as of the most recent game syncGames has
// seen for that team/season - not a standings table computed from this app's
// own resolved questions, ESPN's own number instead (same "trust the
// upstream source, don't recompute it" call as games.weekNumber in ./games).
// Ties default to 0 rather than nullable - every sport this app syncs is
// representable as wins/losses/ties, NFL's the only one that ever needs a
// non-zero tie. otLosses is the NHL's third count instead, and null for every
// league without overtime losses (see parseTeamRecord in lib/team-record.ts).
export const teamRecords = pgTable(
	"team_records",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		wins: integer("wins").notNull().default(0),
		losses: integer("losses").notNull().default(0),
		ties: integer("ties").notNull().default(0),
		otLosses: integer("ot_losses"),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.teamId, t.seasonId)],
)
export type TeamRecord = typeof teamRecords.$inferSelect

// One reading of ESPN's standings row for a team, stamped with the day it was
// taken. Everything here comes off ESPN rather than being recomputed from this
// app's own game rows, the same call teamRecords above makes - including
// pointDifferential, which is stored rather than derived from pointsFor minus
// pointsAgainst so the figure on a card is the figure ESPN prints even in the
// cases where a forfeit or a scoring correction makes those disagree.
//
// A row per day, not a row per team: standings are a mutable snapshot of a
// season in progress, and the cards that read this have to show what was known
// before a game started, never what is known now. A single current row would
// mean a resolved question's page showing a differential that already contains
// the game it was asking about. asOf is a date rather than a timestamp because
// the job that writes it runs daily, so re-running it stays an upsert on the
// same row instead of laying down a second reading of the same morning.
export const teamSeasonStats = pgTable(
	"team_season_stats",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
		asOf: timestamp("as_of", { mode: "date" }).notNull(),
		gamesPlayed: integer("games_played").notNull().default(0),
		pointsFor: integer("points_for").notNull().default(0),
		pointsAgainst: integer("points_against").notNull().default(0),
		pointDifferential: integer("point_differential").notNull().default(0),
		homeWins: integer("home_wins").notNull().default(0),
		homeLosses: integer("home_losses").notNull().default(0),
		homeTies: integer("home_ties").notNull().default(0),
		// Null outside the NHL, same as teamRecords.otLosses.
		homeOtLosses: integer("home_ot_losses"),
		roadWins: integer("road_wins").notNull().default(0),
		roadLosses: integer("road_losses").notNull().default(0),
		roadTies: integer("road_ties").notNull().default(0),
		roadOtLosses: integer("road_ot_losses"),
		// ESPN's own streak string ("W3", "L1"). Stored verbatim rather than
		// parsed into a direction and a count: it is display text on their side
		// too, and every league writes it the same way.
		streak: text("streak"),
		// "8-2". Same reasoning as streak.
		lastTen: text("last_ten"),
		// Total possessions this season, for a net rating. Only basketball has
		// the concept, and it comes from a different endpoint than the rest of
		// this row (team statistics, not standings), so it is null for every
		// other league and for a basketball row whose stats fetch failed.
		possessions: integer("possessions"),
		// ESPN's playoffSeed: the team's place in whatever its league seeds
		// within - its conference or league (AL/NL, East/West), or the whole
		// league for one seeded as a single table (see
		// SyncLeagueConfig.seedsLeagueWide). Carried all season
		// as a running position, and fixed once the regular season ends - the
		// last reading of a season is the seed its postseason is played at.
		playoffSeed: integer("playoff_seed"),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.teamId, t.seasonId, t.asOf),
		// The read every card makes: this team's latest reading before a given
		// moment.
		index("team_season_stats_team_as_of_idx").on(t.teamId, t.asOf.desc()),
	],
)
export type TeamSeasonStats = typeof teamSeasonStats.$inferSelect

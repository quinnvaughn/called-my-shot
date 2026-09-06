import {
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
// non-zero tie.
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
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.teamId, t.seasonId)],
)
export type TeamRecord = typeof teamRecords.$inferSelect

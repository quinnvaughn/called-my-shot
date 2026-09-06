import {
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"

export const sports = pgTable("sports", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // "Basketball"
	slug: text("slug").notNull().unique(), // "basketball"
})

// "inactive" hides a league from new-question creation without deleting it or
// anything that references it - the one lifecycle state this app actually
// needs (e.g. a league announced but not live yet, like MLB at launch).
export const leagueStatus = pgEnum("league_status", ["active", "inactive"])

// How this league's Games tab is browsed one page at a time: "date" steps a
// single calendar day (MLB, NBA - there's no wider grouping above a day's
// slate), "week" steps a whole season week (NFL - a single day is the wrong
// grain, a week is the real scheduling unit). Genuinely just these two shapes
// exist across sports, unlike game_slot which is one league's own vocabulary,
// not a shared concept - see games.slot in ./games.
export const leagueWindowType = pgEnum("league_window_type", ["date", "week"])

export const leagues = pgTable("leagues", {
	id: uuid("id").primaryKey().defaultRandom(),
	sportId: uuid("sport_id")
		.notNull()
		.references(() => sports.id, { onDelete: "cascade" }),
	name: text("name").notNull(), // "NBA"
	abbreviation: text("abbreviation").notNull(),
	slug: text("slug").notNull().unique(), // "nba"
	status: leagueStatus("status").notNull().default("active"),
	windowType: leagueWindowType("window_type").notNull().default("date"),
})
export type League = typeof leagues.$inferSelect

// One row per real-world season a league has played, synced from ESPN (see
// db/sync/sync-seasons.ts) - never hand-entered. year is ESPN's own
// season-year label, which means different things per league by ESPN's own
// convention (NBA labels a season by the year it ENDS in, NFL by the year it
// STARTS in) - kept opaque here rather than interpreted, only meaningful
// paired with leagueId. displayName is ESPN's own human label ("2025-26"),
// also taken as-is rather than formatted by us. postseasonStartsAt/EndsAt are
// nullable - ESPN doesn't publish the bracket/dates until the postseason
// field is actually set, same reasoning as SYNCED_SEASON_TYPES in
// espn-client.ts.
export const seasons = pgTable(
	"seasons",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		year: integer("year").notNull(),
		displayName: text("display_name").notNull(),
		regularSeasonStartsAt: timestamp("regular_season_starts_at").notNull(),
		regularSeasonEndsAt: timestamp("regular_season_ends_at").notNull(),
		postseasonStartsAt: timestamp("postseason_starts_at"),
		postseasonEndsAt: timestamp("postseason_ends_at"),
	},
	(t) => [unique().on(t.leagueId, t.year)],
)
export type Season = typeof seasons.$inferSelect

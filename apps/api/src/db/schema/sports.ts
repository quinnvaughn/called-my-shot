import {
	integer,
	numeric,
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

export const leagues = pgTable("leagues", {
	id: uuid("id").primaryKey().defaultRandom(),
	sportId: uuid("sport_id")
		.notNull()
		.references(() => sports.id, { onDelete: "cascade" }),
	name: text("name").notNull(), // "NBA"
	abbreviation: text("abbreviation").notNull(),
	slug: text("slug").notNull().unique(), // "nba"
	status: leagueStatus("status").notNull().default("active"),
})
export type League = typeof leagues.$inferSelect

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
	},
	(t) => [unique().on(t.leagueId, t.abbreviation)],
)
export type Team = typeof teams.$inferSelect

// A single real-world matchup - what a yes_no/over_under/numeric_guess
// question about one specific game anchors to instead of just baking
// "Team A @ Team B" into its title as unstructured text. Not every question
// has one - season-long questions (a championship, an MVP race) leave
// questions.gameId null. home/away, not a symmetric "teamA/teamB" pair - the
// "@" convention (away @ home) is what the title text and UI both read off.
// Manual for now - no live stats feed exists, so an admin sets this by hand
// on the Data tab. homeScore/awayScore are only meaningful once "final".
export const gameStatus = pgEnum("game_status", ["scheduled", "live", "final"])

export const games = pgTable("games", {
	id: uuid("id").primaryKey().defaultRandom(),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "cascade" }),
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
})
export type Game = typeof games.$inferSelect

// currentTeamId is a plain "who they play for right now" pointer, kept up to
// date by hand as trades happen - not a historical roster log. A question
// about a past game is anchored to that question's own team reference, not
// whatever team a player happens to be on today, so no time travel needed here.
export const players = pgTable("players", {
	id: uuid("id").primaryKey().defaultRandom(),
	currentTeamId: uuid("current_team_id").references(() => teams.id, {
		onDelete: "set null",
	}),
	name: text("name").notNull(),
	position: text("position"), // free text - positions vary too much by sport for an enum
})
export type Player = typeof players.$inferSelect

// A small, hand-picked set of tolerance bands - not one row per stat. Every
// stat in the catalog points at one of these; adding a new stat means
// classifying it into an existing tier, not inventing a new percentage.
// Scoped to counting stats only (rebounds, points, yards) - a rate stat
// (batting average) needs an absolute tolerance in its own units instead of
// a percentage, and guessDistribution's bucketing is hardcoded to the
// nearest whole number besides, so rate stats aren't wired up as numeric_guess
// subjects yet at all. That's a deliberate follow-up, not an oversight.
export const statToleranceTiers = pgTable("stat_tolerance_tiers", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // "Low-Count Box Stat", "High-Volume"
	tolerancePct: numeric("tolerance_pct", {
		precision: 4,
		scale: 3,
		mode: "number",
	}).notNull(),
})
export type StatToleranceTier = typeof statToleranceTiers.$inferSelect

// Scoped to sport, not league - NBA and NCAAB share a stat vocabulary even
// though they're different leagues. category groups a long list for display
// (e.g. "Scoring", "Rebounding", "Passing") rather than one flat wall of options.
export const stats = pgTable(
	"stats",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sportId: uuid("sport_id")
			.notNull()
			.references(() => sports.id, { onDelete: "cascade" }),
		name: text("name").notNull(), // "Points", "Passing Yards"
		category: text("category").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		// Every stat gets one, even stats only ever used for over_under (which
		// has no tolerance concept and ignores this) - assigning it costs
		// nothing and means numeric_guess never has to handle "this catalog
		// stat has no band" as a real case.
		toleranceTierId: uuid("tolerance_tier_id")
			.notNull()
			.references(() => statToleranceTiers.id, { onDelete: "restrict" }),
	},
	(t) => [unique().on(t.sportId, t.name)],
)

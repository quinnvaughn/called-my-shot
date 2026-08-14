import { integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

export const sports = pgTable("sports", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // "Basketball"
	slug: text("slug").notNull().unique(), // "basketball"
})

export const leagues = pgTable("leagues", {
	id: uuid("id").primaryKey().defaultRandom(),
	sportId: uuid("sport_id")
		.notNull()
		.references(() => sports.id, { onDelete: "cascade" }),
	name: text("name").notNull(), // "NBA"
	abbreviation: text("abbreviation").notNull(),
	slug: text("slug").notNull().unique(), // "nba"
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
	},
	(t) => [unique().on(t.sportId, t.name)],
)

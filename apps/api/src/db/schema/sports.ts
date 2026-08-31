import {
	boolean,
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

// How this league's Games tab is browsed one page at a time: "date" steps a
// single calendar day (MLB, NBA - there's no wider grouping above a day's
// slate), "week" steps a whole season week (NFL - a single day is the wrong
// grain, a week is the real scheduling unit). Genuinely just these two shapes
// exist across sports, unlike game_slot below which is one league's own
// vocabulary, not a shared concept - see games.slot.
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
		// by sport for an enum (same reasoning as players.position below). Synced
		// from ESPN's groups endpoint (see db/sync/sync-teams.ts), hand-editable
		// after that the same way color is. Null for a league with no split.
		conference: text("conference"),
		// Nested under conference - "AFC South", "Atlantic". Same sync/edit story
		// as conference. Null for a league with conferences but no further split,
		// or no split at all.
		division: text("division"),
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

// Regular season vs. postseason - not derivable from seasonId alone at query
// time without a join back to seasons' date ranges, and needed on the game
// row itself so a week-window league's window key (seasonType + weekNumber)
// can't collide a week-1 regular-season game with a week-1 playoff game.
export const gameSeasonType = pgEnum("game_season_type", [
	"regular",
	"postseason",
])

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
	// Every position ESPN considers this player eligible at (e.g. a 1B/DH
	// bench bat gets ["1B", "DH"]), synced from ESPN's roster `positions`
	// array - see db/sync/sync-players.ts. Distinct from `position` above,
	// which is just ESPN's single current/primary tag and stays around
	// unchanged for admin display/sorting/editing. This is what award pools
	// (Gold Glove/Silver Slugger-style questions.awardPositions filters -
	// see graphql/types/question.ts) match against, since a player's primary
	// tag alone (e.g. "DH") would wrongly exclude them from a position
	// they're genuinely eligible for (e.g. "1B"). notNull/default [] rather
	// than nullable, same reasoning as seasonsInLeague below - existing rows
	// predate this column and need a re-sync for a real value.
	positions: text("positions").array().notNull().default([]),
	// Whole seasons of NBA (etc.) experience, synced from ESPN's roster
	// `experience.years` (0 for a rookie) - see db/sync/sync-players.ts. Not
	// null/default 0 rather than nullable: every existing row predates this
	// column and needs a re-sync to get a real value, and 0 (read as "rookie")
	// is a safer stand-in than an unknown/null state a filter would have to
	// special-case. Powers awardSeasonsInLeague on questions (see
	// db/schema/questions.ts) - e.g. a "best sophomore" poll narrows to [1].
	seasonsInLeague: integer("seasons_in_league").notNull().default(0),
	// Whether this player is rookie-eligible for the *current* season, per
	// their sport's own real definition - NOT derived from seasonsInLeague.
	// Computed per-league at sync time (see SyncLeagueConfig.resolveRookieEligible
	// in db/sync/leagues.ts): NBA/NFL default to seasonsInLeague === 0, MLB
	// applies its own cumulative AB/IP rule (db/sync/mlb-rookie-eligibility.ts)
	// since a brief prior-season call-up doesn't cost MLB rookie status the way
	// it would trip seasonsInLeague to 1. Powers awardRookieOnly on questions -
	// the mechanism for every real Rookie of the Year question regardless of
	// sport. Not null/default false, same reasoning as seasonsInLeague -
	// existing rows predate this column and need a re-sync to get a real value.
	rookieEligible: boolean("rookie_eligible").notNull().default(false),
})
export type Player = typeof players.$inferSelect

// A small, hand-picked set of tolerance bands - not one row per stat. Every
// stat in the catalog points at one of these; adding a new stat means
// classifying it into an existing tier, not inventing a new percentage.
// toleranceMode says how toleranceValue is read: "percentage" (the original
// behavior - a counting stat like rebounds or yards, banded as a fraction of
// the actual result) or "absolute" (a rate stat like batting average or ERA,
// where a percentage-of-value band makes no sense on a 0-1ish scale - the
// value itself is a fixed amount in the stat's own unit, e.g. +/-0.02 for
// AVG). A stat's rate-vs-counting-ness is read off its tier's mode rather
// than stored again on the stat - one source of truth instead of two that
// could drift apart.
export const toleranceMode = pgEnum("tolerance_mode", [
	"percentage",
	"absolute",
])

export const statToleranceTiers = pgTable("stat_tolerance_tiers", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull().unique(), // "Low-Count Box Stat", "High-Volume"
	toleranceMode: toleranceMode("tolerance_mode")
		.notNull()
		.default("percentage"),
	// A fraction (0-1) of the actual value when mode is "percentage", or a
	// fixed amount in the stat's own unit when mode is "absolute" - see
	// toleranceMode above.
	toleranceValue: numeric("tolerance_value", {
		precision: 4,
		scale: 3,
		mode: "number",
	}).notNull(),
})
export type StatToleranceTier = typeof statToleranceTiers.$inferSelect

// Which subject kind(s) a stat can resolve against - "both" covers most
// counting stats (a team's total rebounds is as real a number as a player's),
// "player"/"team" are for the genuine outliers where only one level makes
// sense (an NFL player has no individual "Points" line the way a team's
// final score does; "Wins" is a team/season concept no player personally
// has). Lets the create-question form and the resolver both reject a stat
// picked against a subject kind it was never meant for, instead of only the
// UI's own convention keeping that straight.
export const statAppliesTo = pgEnum("stat_applies_to", [
	"player",
	"team",
	"both",
])

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
		// Defaults "both" so an existing catalog row (or a migration backfill)
		// isn't wrongly narrowed without a human classifying it - see
		// statAppliesTo above.
		appliesTo: statAppliesTo("applies_to").notNull().default("both"),
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

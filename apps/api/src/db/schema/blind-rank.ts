import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { leagues } from "./sports"
import { teams } from "./teams"
import { users } from "./users"

// One player's line in a league's season leaderboard for one stat, as ESPN
// ranks it: the pool Blind Rank's season prompts draw from, and how its
// career prompts find the players worth asking about.
export const playerSeasonLeaders = pgTable(
	"player_season_leaders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		// ESPN's season year, the year the season ends in.
		year: integer("year").notNull(),
		// ESPN's leaders category, "passingYards".
		category: text("category").notNull(),
		// 0 is the league leader.
		rank: integer("rank").notNull(),
		espnAthleteId: text("espn_athlete_id").notNull(),
		athlete: text("athlete").notNull(),
		// The franchise the player was on that season, when it maps to one this
		// app has, and what it was called then.
		teamId: uuid("team_id").references(() => teams.id, {
			onDelete: "set null",
		}),
		teamName: text("team_name"),
		value: doublePrecision("value").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.leagueId, t.year, t.category, t.espnAthleteId),
		index("player_season_leaders_athlete_idx").on(t.leagueId, t.espnAthleteId),
	],
)
export type PlayerSeasonLeader = typeof playerSeasonLeaders.$inferSelect

// A player's regular-season career totals in the stats Blind Rank's career
// prompts use, keyed like "passing.passingYards".
export const playerCareers = pgTable(
	"player_careers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		espnAthleteId: text("espn_athlete_id").notNull(),
		athlete: text("athlete").notNull(),
		// The franchise they led most seasons for, for the logo beside them.
		teamId: uuid("team_id").references(() => teams.id, {
			onDelete: "set null",
		}),
		stats: jsonb("stats").$type<Record<string, number>>().notNull(),
		fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
	},
	(t) => [unique().on(t.leagueId, t.espnAthleteId)],
)
export type PlayerCareer = typeof playerCareers.$inferSelect

// season_stat: players by one stat in one season. career_stat: players by a
// career total. team_season: teams by one stat in one season. franchise:
// franchises by a count across the archive (titles, playoff trips).
export const rankPuzzleKind = pgEnum("rank_puzzle_kind", [
	"season_stat",
	"career_stat",
	"team_season",
	"franchise",
])

// One thing to rank: what's shown, and the value it's ranked by, which the
// player sees only once all five are placed.
export type RankItem = {
	label: string
	sublabel: string | null
	// For the logo beside it.
	teamId: string | null
	value: number
	// The value as it's shown in the reveal, "4,806".
	display: string
}

// One day's Blind Rank: five items in the order they're revealed, ranked by
// the stat the prompt names. Built from the pools when the day is scheduled
// and stored whole, so a career total that moves later can't change a day
// already set.
export const rankPuzzles = pgTable("rank_puzzles", {
	id: uuid("id").primaryKey().defaultRandom(),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "cascade" }),
	kind: rankPuzzleKind("kind").notNull(),
	// "Receiving yards".
	prompt: text("prompt").notNull(),
	// "2007 NFL season".
	context: text("context").notNull(),
	items: jsonb("items").$type<RankItem[]>().notNull(),
	// What makes two puzzles the same one, so none repeats: the stat and
	// season for a season prompt, the five items otherwise.
	signature: text("signature").notNull().unique(),
	// "2026-10-20" in the sports time zone.
	playDate: text("play_date").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
})
export type RankPuzzle = typeof rankPuzzles.$inferSelect

// One player's game. `placements` is the slot (0 is the top) given to each
// item, in reveal order; how many are right is worked out from them.
export const rankPuzzleResults = pgTable(
	"rank_puzzle_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		puzzleId: uuid("puzzle_id")
			.notNull()
			.references(() => rankPuzzles.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		placements: integer("placements").array().notNull().default([]),
		// Set when the fifth is placed.
		finishedAt: timestamp("finished_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.puzzleId, t.userId),
		index("rank_puzzle_results_user_idx").on(t.userId),
	],
)
export type RankPuzzleResult = typeof rankPuzzleResults.$inferSelect

import {
	boolean,
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

// How a season ended. lost_round covers every round before the final four
// (or the final two, in a league with fewer rounds); roundsFromFinal on the
// row says which.
export const teamSeasonOutcome = pgEnum("team_season_outcome", [
	"champion",
	"finalist",
	"lost_semifinal",
	"lost_round",
	"missed",
])

// One leader line on a team's season: the player who led the team in a
// category, and their line in it ("4806 YDS, 50 TD, 8 INT").
export type TeamSeasonLeader = {
	category: string
	athlete: string
	line: string
}

// One franchise's finished season, as ESPN recorded it: the answer pool for
// Name That Season. Written once by the archive (lib/season-puzzles/
// archive.ts) and never changed by play.
export const teamSeasons = pgTable(
	"team_seasons",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		// The franchise as it exists today: the 1995 Houston Oilers are the
		// Titans' row. A guess names the franchise, so this is what a guess is
		// checked against.
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// ESPN's season year: the year the season ends in, so the NBA's
		// 1995-96 is 1996.
		year: integer("year").notNull(),
		// "2007", or "1995-96" for a league whose season crosses the new year.
		label: text("label").notNull(),
		// What the team was called that season: "Houston Oilers".
		name: text("name").notNull(),
		wins: integer("wins").notNull(),
		losses: integer("losses").notNull(),
		// NFL and old NHL ties.
		ties: integer("ties").notNull().default(0),
		// NHL overtime losses.
		otLosses: integer("ot_losses").notNull().default(0),
		pointsFor: integer("points_for").notNull(),
		pointsAgainst: integer("points_against").notNull(),
		// That season's names, which aren't today's: "AFC Central".
		conference: text("conference"),
		division: text("division"),
		// Place in the division, or the conference where ESPN has no
		// divisions for the league.
		divisionRank: integer("division_rank"),
		outcome: teamSeasonOutcome("outcome").notNull(),
		// For a team that made the playoffs, how many rounds it was from the
		// final when it went out: 0 lost (or won) the final, 1 the round
		// before. Null for a team that missed.
		roundsFromFinal: integer("rounds_from_final"),
		leaders: jsonb("leaders").$type<TeamSeasonLeader[]>().notNull(),
		// False when ESPN's leaders for the season look incomplete (a star
		// missing from its records), so the season is kept out of the
		// schedule rather than given a clue that isn't true.
		puzzleReady: boolean("puzzle_ready").notNull().default(true),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.teamId, t.year),
		index("team_seasons_league_idx").on(t.leagueId),
	],
)
export type TeamSeason = typeof teamSeasons.$inferSelect

// One day's Name That Season: the team-season that's the answer, and the
// six clues it's played with, from vague to a near giveaway. A row exists
// only for a scheduled day. The clues are stored rather than generated on
// read, so an archive rerun or an admin edit can't change a day mid-play.
export const seasonPuzzles = pgTable("season_puzzles", {
	id: uuid("id").primaryKey().defaultRandom(),
	teamSeasonId: uuid("team_season_id")
		.notNull()
		.references(() => teamSeasons.id, { onDelete: "cascade" }),
	clues: text("clues").array().notNull(),
	// "2026-10-20" in the sports time zone. A puzzle is known by this date;
	// there is no number.
	playDate: text("play_date").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
})
export type SeasonPuzzle = typeof seasonPuzzles.$inferSelect

// One guess: a franchise and a season year.
export type SeasonGuessInput = { teamId: string; year: number }

// One player's game on one puzzle. Whether it's solved, missed or still going
// is worked out from `guesses` against the puzzle's answer, never stored
// separately, so the two can't disagree.
export const seasonPuzzleResults = pgTable(
	"season_puzzle_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		puzzleId: uuid("puzzle_id")
			.notNull()
			.references(() => seasonPuzzles.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// In the order they were guessed.
		guesses: jsonb("guesses").$type<SeasonGuessInput[]>().notNull().default([]),
		// Set when the game ends, solved or missed.
		finishedAt: timestamp("finished_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.puzzleId, t.userId),
		index("season_puzzle_results_user_idx").on(t.userId),
	],
)
export type SeasonPuzzleResult = typeof seasonPuzzleResults.$inferSelect

import {
	boolean,
	index,
	integer,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { players } from "./players"
import { teams } from "./teams"

// Everyone who ever played for a franchise, one row per player per franchise,
// written by the all-time histories in lib/franchise-history. This is the
// pool a Mount Rushmore is picked from. teamId is today's franchise, so the
// Brooklyn Dodgers' players sit under the Dodgers and the 1953-83 Baltimore
// Colts' under Indianapolis.
//
// Seasons are the year a season ended (1986 for 1985-86), the same convention
// as team_seasons.year. score ranks the picker and nothing else: each league
// builds it from what its source has (games and points, WAR, Hall of Fame),
// so it only compares players within one league.
export const playerFranchiseStints = pgTable(
	"player_franchise_stints",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		firstSeason: integer("first_season").notNull(),
		lastSeason: integer("last_season").notNull(),
		seasons: integer("seasons").notNull(),
		games: integer("games"),
		score: numeric("score", { precision: 10, scale: 3, mode: "number" })
			.notNull()
			.default(0),
		hallOfFame: boolean("hall_of_fame").notNull().default(false),
		// What they played for the franchise, as the league's codes in
		// RUSHMORE_POSITIONS (@called-my-shot/schemas), so a prompt narrowed to
		// point guards can filter on it. Empty when no source says. Written by
		// lib/franchise-history/positions.ts.
		positions: text("positions").array().notNull().default([]),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.playerId, t.teamId),
		index("player_franchise_stints_team_score_idx").on(
			t.teamId,
			t.score.desc(),
		),
	],
)
export type PlayerFranchiseStint = typeof playerFranchiseStints.$inferSelect

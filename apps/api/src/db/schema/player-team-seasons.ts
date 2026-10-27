import { index, integer, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core"
import { players } from "./players"
import { teams } from "./teams"

// Every season a player spent with a franchise, one row per player per
// franchise per season, written by the all-time histories in
// lib/franchise-history alongside the stints. Two players are teammates when
// they share a row's team and season, which a stint's first-to-last range
// can't tell (Jordan's Bulls range covers his baseball years).
//
// teamId is today's franchise, as in player_franchise_stints. season is the
// same year team_seasons.year uses for the league (the year an NBA or NHL
// season ends in), so the two join for what a team was called that year.
export const playerTeamSeasons = pgTable(
	"player_team_seasons",
	{
		playerId: uuid("player_id")
			.notNull()
			.references(() => players.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		season: integer("season").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.playerId, t.teamId, t.season] }),
		index("player_team_seasons_team_season_idx").on(t.teamId, t.season),
	],
)
export type PlayerTeamSeason = typeof playerTeamSeasons.$inferSelect

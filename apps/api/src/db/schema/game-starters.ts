import {
	integer,
	pgEnum,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { games } from "./games"
import { players } from "./players"
import { teams } from "./teams"

// Which slice of a team's lineup a row belongs to. The role also says how firm
// the data is, which is why there's no separate column for it:
// starting_pitcher is ESPN's probable (can change up to first pitch), batter is
// the posted batting order, and offense/defense/starter come off ESPN's depth
// charts - a projection, since ESPN publishes no confirmed NFL or NBA starters
// before the game.
export const gameStarterRole = pgEnum("game_starter_role", [
	"starting_pitcher",
	"batter",
	"offense",
	"defense",
	"starter",
])

// Who's starting a game, per team, synced by db/sync/sync-game-starters.ts.
// Each (game, team, role) is replaced as a whole on every refresh, so this
// always reflects ESPN's latest listing rather than accumulating history.
export const gameStarters = pgTable(
	"game_starters",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		teamId: uuid("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		// Null when ESPN names an athlete the daily roster sync hasn't picked up
		// yet (a same-day call-up) - playerName still displays them.
		playerId: uuid("player_id").references(() => players.id, {
			onDelete: "set null",
		}),
		role: gameStarterRole("role").notNull(),
		// The batting order spot for a batter, otherwise the position's place in
		// the depth chart. Unique per (game, team, role), so it's also the
		// display order.
		sortOrder: integer("sort_order").notNull(),
		playerName: text("player_name").notNull(),
		position: text("position"),
		// Display-ready season line for a probable pitcher ("5-3, 3.09 ERA").
		statLine: text("stat_line"),
		// ESPN's depth chart injury designation ("Questionable", "Out", ...).
		injuryStatus: text("injury_status"),
	},
	(t) => [unique().on(t.gameId, t.teamId, t.role, t.sortOrder)],
)
export type GameStarter = typeof gameStarters.$inferSelect

import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { players } from "./players"
import { leagues } from "./sports"
import { users } from "./users"

// One move in a game of Teammate Chain, as it was judged when made. A pick
// that shared a team-season with the chain's last player was added (and
// `connects` when he also played with the target, which solves it); any
// other pick was a miss. A hint is one more clue about a mystery teammate
// of the chain's last player, `playerId`, who can still reach the target.
// Judged once and stored, so a later roster ingest can't change a game
// already played.
export type ChainMove =
	| { kind: "add"; playerId: string; connects: boolean }
	| { kind: "miss"; playerId: string }
	| { kind: "hint"; playerId: string }
	| { kind: "undo" }
	| { kind: "give_up" }

// One day's Teammate Chain: connect the start player to the target through
// players who were teammates. par is the fewest links any route needs, and
// parRoute one such route's middle players, shown to a player who gives up.
export const teammateChainPuzzles = pgTable("teammate_chain_puzzles", {
	id: uuid("id").primaryKey().defaultRandom(),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "cascade" }),
	startPlayerId: uuid("start_player_id")
		.notNull()
		.references(() => players.id, { onDelete: "cascade" }),
	targetPlayerId: uuid("target_player_id")
		.notNull()
		.references(() => players.id, { onDelete: "cascade" }),
	par: integer("par").notNull(),
	parRoute: uuid("par_route").array().notNull(),
	// The pair, either way round, so it never runs twice.
	signature: text("signature").notNull().unique(),
	// "2026-10-20" in the sports time zone.
	playDate: text("play_date").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
})
export type TeammateChainPuzzle = typeof teammateChainPuzzles.$inferSelect

// One player's game. The state follows from `moves`; `solved` and `route`
// (the middle players of a solved chain, in order) are written when it ends
// so the day's rarity is a count over rows.
export const teammateChainResults = pgTable(
	"teammate_chain_results",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		puzzleId: uuid("puzzle_id")
			.notNull()
			.references(() => teammateChainPuzzles.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		moves: jsonb("moves").$type<ChainMove[]>().notNull().default([]),
		// When they pressed Start. The clock runs from here to finishedAt.
		startedAt: timestamp("started_at").notNull().defaultNow(),
		// Set when the game ends, solved or given up.
		finishedAt: timestamp("finished_at"),
		solved: boolean("solved").notNull().default(false),
		route: uuid("route").array().notNull().default([]),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique().on(t.puzzleId, t.userId),
		index("teammate_chain_results_user_idx").on(t.userId),
	],
)
export type TeammateChainResult = typeof teammateChainResults.$inferSelect

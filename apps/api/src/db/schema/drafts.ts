import { sql } from "drizzle-orm"
import {
	check,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { players } from "./players"
import { leagues } from "./sports"
import { teams } from "./teams"

// Every draft class, one row per pick plus one per player who came into the
// league undrafted that year, written by lib/draft-history. This is what a
// redraft is played over: the picks are its slots, the players its pool.
//
// overall is null on an undrafted row. round is null there too, and on an
// MLB pick from a supplemental round ("C-1"), which sits between the
// numbered rounds and so isn't part of the first round's count.
//
// teamId is today's franchise for the team that held the pick (the 2007
// SuperSonics' pick sits under Oklahoma City), null for a franchise that
// folded; teamName is what that team was called that year.
//
// playerId is null for a draftee this app has no player for, mostly someone
// who never played in the league. playerName keeps who was taken either way.
// A player belongs to one class: one drafted twice (an MLB pick who went back
// to school) counts in the class he signed out of, and his earlier pick keeps
// only his name.
export const draftEntries = pgTable(
	"draft_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		year: integer("year").notNull(),
		round: integer("round"),
		overall: integer("overall"),
		teamId: uuid("team_id").references(() => teams.id, {
			onDelete: "set null",
		}),
		teamName: text("team_name"),
		playerId: uuid("player_id").references(() => players.id, {
			onDelete: "set null",
		}),
		playerName: text("player_name").notNull(),
	},
	(t) => [
		uniqueIndex("draft_entries_pick_idx")
			.on(t.leagueId, t.year, t.overall)
			.where(sql`${t.overall} is not null`),
		uniqueIndex("draft_entries_player_idx")
			.on(t.leagueId, t.playerId)
			.where(sql`${t.playerId} is not null`),
		index("draft_entries_class_idx").on(t.leagueId, t.year),
		check(
			"draft_entries_undrafted_has_no_round",
			sql`${t.overall} is not null or ${t.round} is null`,
		),
	],
)
export type DraftEntry = typeof draftEntries.$inferSelect

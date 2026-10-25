import {
	boolean,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { teams } from "./teams"

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
	// (Gold Glove/Silver Slugger-style questions.awardPositions filters - see
	// lib/award-pool.ts) match against, since a player's primary tag alone
	// (e.g. "DH") would wrongly exclude them from a position they're genuinely
	// eligible for (e.g. "1B"). notNull/default [] rather than nullable, same
	// reasoning as seasonsInLeague below - existing rows predate this column
	// and need a re-sync for a real value.
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
	// Why this player is currently sidelined, in ESPN's own designation
	// vocabulary ("Questionable", "Out", "Injured Reserve", "60-Day-IL"), or
	// null when nothing says they're hurt - synced from the roster by
	// athleteInjuryStatus in db/sync/sync-players.ts. Deliberately the same
	// vocabulary game_starters.injuryStatus carries off depth charts, so one
	// filter (isPlayable in lib/game-questions/pick-subjects.ts) reads both:
	// generated questions pick MLB batters off this table roughly a day out,
	// long before a lineup posts, so without this an out-for-the-season bat is
	// just another name in the pool.
	injuryStatus: text("injury_status"),
	// A headshot on the player's own league CDN, resolved at sync time by
	// db/sync/league-images.ts and hotlinked rather than copied. Null when the
	// league's roster had no match for this player, which the UI renders as
	// initials.
	headshotUrl: text("headshot_url"),
	// The player's square head-and-shoulders portrait for Mount Rushmore art,
	// as an R2 key (see lib/portraits). Built once from the best photo any source has
	// and never hotlinked, since the share image renders it on every request.
	portraitKey: text("portrait_key"),
	// When the portrait pipeline last looked for a photo of this player, found
	// or not. A player checked with no portraitKey had no usable photo, and
	// the art shows their initials instead; the backfill skips them unless
	// forced.
	portraitCheckedAt: timestamp("portrait_checked_at"),
})
export type Player = typeof players.$inferSelect

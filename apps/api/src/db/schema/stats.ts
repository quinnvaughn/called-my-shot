import {
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { sports } from "./sports"

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
		// A plausible over/under line for ONE GAME, split by subject kind
		// because the same stat sits at wildly different magnitudes for the two
		// (a player scores ~24 points, a team ~112). Seeds the create-question
		// line field; never used for resolution or scoring.
		//
		// Always per-game, with no second reading - a season-only stat like
		// "Wins" has no meaningful per-game value (0.5 wins a night) and so
		// carries none at all. Season-total questions seed nothing rather than
		// this column pulling double duty, which would make every per-game stat
		// seed ~82x too low.
		//
		// Nullable on purpose: a stat with no sensible default seeds nothing
		// rather than seeding a lie.
		typicalPlayerLine: numeric("typical_player_line", {
			precision: 8,
			scale: 3,
			mode: "number",
		}),
		typicalTeamLine: numeric("typical_team_line", {
			precision: 8,
			scale: 3,
			mode: "number",
		}),
	},
	(t) => [unique().on(t.sportId, t.name)],
)

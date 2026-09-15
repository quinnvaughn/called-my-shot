import {
	boolean,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

// The tolerance band one league's team numeric guesses on a stat are created
// with (see bandTemplates in lib/game-questions/band-calibration.ts), used in
// place of the stat's catalog band. Written by an admin on the Bands page and
// by tuneBands as it moves the band. A league stat with no row here uses the
// catalog band and is tuned automatically. Kept apart from
// stat_tolerance_tiers because the catalog sync rewrites those on every
// release.
export const gameQuestionBandSettings = pgTable(
	"game_question_band_settings",
	{
		leagueSlug: text("league_slug").notNull(),
		statName: text("stat_name").notNull(),
		// In the stat's own unit: a guess within this many of the result is a
		// hit.
		band: integer("band").notNull(),
		// Whether tuneBands moves this band on its own. Off once an admin sets
		// the band by hand.
		autoTune: boolean("auto_tune").notNull().default(true),
		// When tuneBands last moved the band. Null until it first does.
		tunedAt: timestamp("tuned_at"),
		updatedById: uuid("updated_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.leagueSlug, t.statName] })],
)
export type GameQuestionBandSetting =
	typeof gameQuestionBandSettings.$inferSelect

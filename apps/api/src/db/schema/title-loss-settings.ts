import {
	boolean,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

// The loss rate one league's single-pick title questions (a final, a
// conference title, a pennant) are created with, by award name (see
// titleGroups in lib/game-questions/title-calibration.ts), used in place of
// LOSS_RATE_BY_SHAPE's default. Written by an admin on the Titles page and by
// tuneTitleLosses as it moves the rate. A league title with no row here uses
// the default and is tuned automatically.
export const titleLossSettings = pgTable(
	"title_loss_settings",
	{
		leagueSlug: text("league_slug").notNull(),
		awardName: text("award_name").notNull(),
		// The share of committed points a miss costs, 0-1.
		lossRate: numeric("loss_rate", {
			precision: 4,
			scale: 3,
			mode: "number",
		}).notNull(),
		// Whether tuneTitleLosses moves this rate on its own. Off once an admin
		// sets the rate by hand.
		autoTune: boolean("auto_tune").notNull().default(true),
		// When tuneTitleLosses last moved the rate. Null until it first does.
		tunedAt: timestamp("tuned_at"),
		updatedById: uuid("updated_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.leagueSlug, t.awardName] })],
)
export type TitleLossSetting = typeof titleLossSettings.$inferSelect

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

// The loss rate one league's game stat leader questions on a stat are created
// with (see leaderTemplates in lib/game-questions/leader-calibration.ts),
// used in place of LOSS_RATE_BY_SHAPE's default. Written by an admin on the
// Leaders page and by tuneLeaderLosses as it moves the rate. A league stat
// with no row here uses the default and is tuned automatically.
export const gameQuestionLossSettings = pgTable(
	"game_question_loss_settings",
	{
		leagueSlug: text("league_slug").notNull(),
		statName: text("stat_name").notNull(),
		// The share of committed points a miss costs, 0-1.
		lossRate: numeric("loss_rate", {
			precision: 4,
			scale: 3,
			mode: "number",
		}).notNull(),
		// Whether tuneLeaderLosses moves this rate on its own. Off once an admin
		// sets the rate by hand.
		autoTune: boolean("auto_tune").notNull().default(true),
		// When tuneLeaderLosses last moved the rate. Null until it first does.
		tunedAt: timestamp("tuned_at"),
		updatedById: uuid("updated_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.leagueSlug, t.statName] })],
)
export type GameQuestionLossSetting =
	typeof gameQuestionLossSettings.$inferSelect

import {
	boolean,
	integer,
	numeric,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { users } from "./users"

// The settings one generated over/under template's lines are set from (see
// LineRule in lib/game-questions/lines.ts), used in place of the catalog's.
// Written by an admin on the Lines page and by tuneLines as it moves a shade.
// A template with no row here sets its lines from the catalog and is tuned
// automatically. Keyed by league slug and template id, the same pair every
// generated question's generationKey starts with.
export const gameQuestionLineSettings = pgTable(
	"game_question_line_settings",
	{
		leagueSlug: text("league_slug").notNull(),
		templateId: text("template_id").notNull(),
		shade: numeric("shade", {
			precision: 5,
			scale: 3,
			mode: "number",
		}).notNull(),
		minLine: numeric("min_line", {
			precision: 8,
			scale: 3,
			mode: "number",
		}).notNull(),
		minGames: integer("min_games").notNull(),
		// Whether tuneLines moves this template's shade on its own. Off once an
		// admin sets the shade by hand.
		autoTune: boolean("auto_tune").notNull().default(true),
		// When tuneLines last moved the shade. Null until it first does.
		tunedAt: timestamp("tuned_at"),
		updatedById: uuid("updated_by_id").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [primaryKey({ columns: [t.leagueSlug, t.templateId] })],
)
export type GameQuestionLineSetting =
	typeof gameQuestionLineSettings.$inferSelect

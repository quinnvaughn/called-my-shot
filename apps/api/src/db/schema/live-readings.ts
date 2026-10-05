import { jsonb, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core"
import { questions } from "./questions"

export type LiveOptionValue = { optionId: string; value: number | null }

// Where a game question stands while its game is being played, read off
// ESPN's in-progress box score by db/sync/sync-live-readings.ts with the same
// extractors that settle it. One row per question, overwritten each pass, so
// it only ever holds the latest reading. Nothing is graded from the reading
// itself, and once the question settles its own result is what's shown. A
// question whose result is already decided mid-game (see decidedEarly)
// settles once clinchedSince shows it has held.
export const questionLiveReadings = pgTable("question_live_readings", {
	questionId: uuid("question_id")
		.primaryKey()
		.references(() => questions.id, { onDelete: "cascade" }),
	// The one number the question is about so far: a subject's stat on an
	// over/under or numeric guess, both teams' scores added up on a game total.
	// Null on the comparison shapes, and when the subject has no line yet.
	value: numeric("value", { precision: 8, scale: 3, mode: "number" }),
	// Each option's own subject so far, on the shapes graded by comparing
	// options (head-to-head, leader, team vs team). A null value is a subject
	// with nothing in the box score yet.
	optionValues: jsonb("option_values").$type<LiveOptionValue[]>(),
	// The first pass that found the result already decided, kept for as long
	// as each pass after still does and cleared by one that doesn't. A replay
	// can take a play back minutes after ESPN shows it, so the question settles
	// only once this is old enough that a review would have come and gone.
	clinchedSince: timestamp("clinched_since"),
	updatedAt: timestamp("updated_at").notNull(),
})
export type QuestionLiveReading = typeof questionLiveReadings.$inferSelect

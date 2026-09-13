import {
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core"
import { questions } from "./questions"

// Why the automatic resolver couldn't settle a question.
// fetch_failed / box_score_not_final / subject_not_in_box_score: the data may
// still arrive, so the question is retried for a while before an admin sees it.
// stat_undefined: the stat has no value for this game, like an ERA with no
// innings pitched. recheck_disagreed: the 24-hour re-check couldn't settle a
// question the first pass already had, so the posted result was left alone.
// The rest are what they say.
export const autoResolveFailure = pgEnum("auto_resolve_failure", [
	"fetch_failed",
	"box_score_not_final",
	"missing_external_ref",
	"subject_not_in_box_score",
	"stat_undefined",
	"tie",
	"push",
	"leader_not_in_pool",
	"no_leader",
	"unmapped",
	"recheck_disagreed",
])
export type AutoResolveFailure = (typeof autoResolveFailure.enumValues)[number]

// The automatic resolver's bookkeeping for one system-mode question - see
// db/sync/auto-resolve-games.ts. No row means the resolver hasn't looked at the
// question yet.
export const questionAutoResolutions = pgTable("question_auto_resolutions", {
	questionId: uuid("question_id")
		.primaryKey()
		.references(() => questions.id, { onDelete: "cascade" }),
	attempts: integer("attempts").notNull().default(0),
	lastAttemptAt: timestamp("last_attempt_at"),
	// Earliest the resolver tries again after a retryable failure.
	nextAttemptAt: timestamp("next_attempt_at"),
	failureReason: autoResolveFailure("failure_reason"),
	failureDetail: text("failure_detail"),
	// Handed to an admin: the resolver stops trying, and the question shows in
	// the admin queue.
	escalatedAt: timestamp("escalated_at"),
	// When the resolver first settled the question, as resolved or voided.
	settledAt: timestamp("settled_at"),
	// ESPN corrects box scores after the fact, so a settled question is read
	// once more at this time and re-scored if the result changed.
	recheckDueAt: timestamp("recheck_due_at"),
	recheckedAt: timestamp("rechecked_at"),
	// The values the last decision was made from, for the admin queue.
	evidence: jsonb("evidence").$type<Record<string, unknown>>(),
})
export type QuestionAutoResolution = typeof questionAutoResolutions.$inferSelect

import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { questions } from "./questions"
import { users } from "./users"

export const disputeStatus = pgEnum("dispute_status", [
	"open",
	"upheld",
	"overturned",
])

// Filed against a resolved question when a caller thinks the stated result is
// wrong. One per user per question. Filing one moves the question to
// "disputed"; an admin reviewing it either upholds the original resolution
// (status back to resolved, dispute -> upheld) or overturns it (resolution
// fields get corrected, status back to resolved, dispute -> overturned).
export const resolutionDisputes = pgTable(
	"resolution_disputes",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		reason: text("reason").notNull(),
		status: disputeStatus("status").notNull().default("open"),
		resolutionNote: text("resolution_note"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		resolvedAt: timestamp("resolved_at"),
	},
	(t) => [unique().on(t.questionId, t.userId)],
)

// Reasons an admin can void a question. Not all of them strike the asker by
// default (see questionVoids.countsAsStrike below) - nonsensical/off_topic/
// unsupported_sport do by default, duplicate/other don't, but it's a per-void
// toggle either way, never hardcoded to the reason.
export const voidReason = pgEnum("void_reason", [
	"nonsensical",
	"off_topic",
	"unsupported_sport",
	"duplicate",
	"other",
])

// One row per voided question, kept even though the question itself is
// hard-deleted (see voidQuestion resolver) - deleting the question is safe
// for scoring (every point total is computed live from calls, nothing
// persisted per-user needs reversing), but without this table the Users tab's
// void history and the strike count backing questionCreationEnabled would
// have nothing to read. questionId/questionTitle are a snapshot, not a live
// FK, since the row they'd point to is gone by the time this is queried.
export const questionVoids = pgTable("question_voids", {
	id: uuid("id").primaryKey().defaultRandom(),
	questionId: uuid("question_id").notNull(),
	questionTitle: text("question_title").notNull(),
	targetUserId: uuid("target_user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	voidedByAdminId: uuid("voided_by_admin_id").references(() => users.id, {
		onDelete: "set null",
	}),
	reason: voidReason("reason").notNull(),
	// Only set when reason = "duplicate".
	duplicateOfQuestionId: uuid("duplicate_of_question_id").references(
		() => questions.id,
		{ onDelete: "set null" },
	),
	// Internal-only - never shown to the asker, unlike questions.resolutionNote.
	note: text("note"),
	countsAsStrike: boolean("counts_as_strike").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
})
export type QuestionVoid = typeof questionVoids.$inferSelect

export const reportStatus = pgEnum("report_status", ["open", "dismissed"])

// Filed by any signed-in caller who thinks a question itself is bad (not a
// dispute over a resolution - see resolutionDisputes for that). Reuses
// voidReason rather than its own enum: a report's reason is deliberately the
// same set admin already voids questions for, just phrased for a caller who
// doesn't know or care about admin's internal categories - the UI-facing
// labels differ (see lib/report-defaults.ts on the frontend), the values
// never do. One per user per question.
export const questionReports = pgTable(
	"question_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		reportedByUserId: uuid("reported_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		reason: voidReason("reason").notNull(),
		details: text("details"),
		status: reportStatus("status").notNull().default("open"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		reviewedAt: timestamp("reviewed_at"),
	},
	(t) => [unique().on(t.questionId, t.reportedByUserId)],
)
export type QuestionReport = typeof questionReports.$inferSelect

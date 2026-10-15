import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import { calls } from "./calls"
import { games } from "./games"
import { users } from "./users"

// One user's post-game Q&A on one game, covering every call they made on it.
// Opened by lib/pressers/drain.ts once the game is final and the last of
// their calls on it has settled, and open until closesAt. There's no status
// column: past closesAt it's closed, with nothing to flip.
//
// The statement is optional and posted once. statementRemovedAt is an admin
// taking it down off a report; the text stays for the report's record.
export const pressers = pgTable(
	"pressers",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		openedAt: timestamp("opened_at").notNull(),
		closesAt: timestamp("closes_at").notNull(),
		// When the questions built from the owner's results were written. Null
		// until the owner first opens their own presser - see
		// ensureAppQuestions in lib/pressers/app-questions.ts.
		appQuestionsGeneratedAt: timestamp("app_questions_generated_at"),
		statementText: text("statement_text"),
		statementPostedAt: timestamp("statement_posted_at"),
		statementRemovedAt: timestamp("statement_removed_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.userId, t.gameId),
		index("pressers_game_id_idx").on(t.gameId),
	],
)
export type Presser = typeof pressers.$inferSelect

// app: built from the owner's own results. group: from someone who shares a
// group with the owner. game_caller: from anyone else with a call on the game.
export const presserQuestionSource = pgEnum("presser_question_source", [
	"app",
	"group",
	"game_caller",
])
export type PresserQuestionSource =
	(typeof presserQuestionSource.enumValues)[number]

// pending: asked, not answered. answered: answered or "No comment", and the
// only status anyone but the owner and the asker ever sees. withdrawn: an app
// question whose fact no longer holds, or a question from someone the owner
// then blocked. removed: taken down by an admin off a report.
export const presserQuestionStatus = pgEnum("presser_question_status", [
	"pending",
	"answered",
	"withdrawn",
	"removed",
])
export type PresserQuestionStatus =
	(typeof presserQuestionStatus.enumValues)[number]

// Which fact an app question was built from - see lib/pressers/templates.ts.
export const presserAppTemplate = pgEnum("presser_app_template", [
	"high_conviction_miss",
	"redo_flip_lost",
	"contrarian_hit",
	"contrarian_miss",
	"streak_extended",
	"perfect_game",
	"oh_fer_game",
	"game_summary",
])
export type PresserAppTemplate = (typeof presserAppTemplate.enumValues)[number]

export const presserQuestions = pgTable(
	"presser_questions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		presserId: uuid("presser_id")
			.notNull()
			.references(() => pressers.id, { onDelete: "cascade" }),
		source: presserQuestionSource("source").notNull(),
		// Null on an app question, and on a question whose asker deleted their
		// account.
		askerId: uuid("asker_id").references(() => users.id, {
			onDelete: "set null",
		}),
		// App questions only. callId is the call the question is about, null on
		// one about the whole game. appKey is `${template}:${callId ?? "game"}`,
		// unique per presser so generating twice writes nothing new.
		appTemplate: presserAppTemplate("app_template"),
		callId: uuid("call_id").references(() => calls.id, {
			onDelete: "set null",
		}),
		appKey: text("app_key"),
		// An app question's rendered text is stored, not rebuilt on read, so it
		// reads the same after the facts behind it move.
		body: text("body").notNull(),
		answerText: text("answer_text"),
		noComment: boolean("no_comment").notNull().default(false),
		answeredAt: timestamp("answered_at"),
		status: presserQuestionStatus("status").notNull().default("pending"),
		// Display order, fixed when asked: 0 app, 1 groupmate, 2 anyone else
		// who called the game.
		sortRank: integer("sort_rank").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		// One question per asker per presser. App rows have no asker, and nulls
		// never collide.
		unique().on(t.presserId, t.askerId),
		uniqueIndex("presser_questions_app_key_idx").on(t.presserId, t.appKey),
		index("presser_questions_presser_status_idx").on(
			t.presserId,
			t.status,
			t.sortRank,
			t.createdAt,
		),
	],
)
export type PresserQuestion = typeof presserQuestions.$inferSelect

// (user, game) pairs whose presser may be due. Written in the transaction
// that settles, voids or deletes a game question (see markPresserDue), and
// worked off by drainPresserOpens. dirtiedAt is compared for equality the
// same way streakRecomputeQueue's is.
export const presserOpenQueue = pgTable(
	"presser_open_queue",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		gameId: uuid("game_id")
			.notNull()
			.references(() => games.id, { onDelete: "cascade" }),
		dirtiedAt: timestamp("dirtied_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.gameId] })],
)

// The blocker never hears from the blocked user again through a presser, in
// either direction: neither can ask the other a question.
export const userBlocks = pgTable(
	"user_blocks",
	{
		blockerId: uuid("blocker_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		blockedId: uuid("blocked_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.blockerId, t.blockedId] }),
		index("user_blocks_blocked_id_idx").on(t.blockedId),
	],
)

export const presserReportTarget = pgEnum("presser_report_target", [
	"question",
	"answer",
	"statement",
])
export type PresserReportTarget =
	(typeof presserReportTarget.enumValues)[number]

export const presserReportReason = pgEnum("presser_report_reason", [
	"harassment",
	"hate",
	"threat",
	"sexual",
	"personal_info",
	"spam",
	"other",
])

// Its own enum rather than report_status: an admin acting on one of these
// can take the content down, which a question report has no equivalent of.
export const presserReportStatus = pgEnum("presser_report_status", [
	"open",
	"dismissed",
	"removed",
])

// A report on something said in a presser. presserQuestionId is null only
// for a statement report.
export const presserReports = pgTable(
	"presser_reports",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		reporterId: uuid("reporter_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		presserId: uuid("presser_id")
			.notNull()
			.references(() => pressers.id, { onDelete: "cascade" }),
		presserQuestionId: uuid("presser_question_id").references(
			() => presserQuestions.id,
			{ onDelete: "cascade" },
		),
		target: presserReportTarget("target").notNull(),
		reason: presserReportReason("reason").notNull(),
		details: text("details"),
		status: presserReportStatus("status").notNull().default("open"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		reviewedAt: timestamp("reviewed_at"),
		reviewedByAdminId: uuid("reviewed_by_admin_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(t) => [
		unique()
			.on(t.reporterId, t.presserId, t.presserQuestionId, t.target)
			.nullsNotDistinct(),
		index("presser_reports_status_idx").on(t.status, t.createdAt),
	],
)
export type PresserReport = typeof presserReports.$inferSelect

import {
	boolean,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { games, leagues, players, sports, stats, teams } from "./sports"
import { users } from "./users"

export const questionType = pgEnum("question_type", [
	"multiple_choice",
	"yes_no",
	"over_under",
	"numeric_guess",
	"multi_select",
])

export const questionCategory = pgEnum("question_category", [
	"season_awards",
	"game_stats",
	"player_stats",
	"other",
])

export const questionStatus = pgEnum("question_status", [
	"open",
	"locked",
	"resolved",
	"disputed",
])

export const disputeStatus = pgEnum("dispute_status", [
	"open",
	"upheld",
	"overturned",
])

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

export const numericSubjectType = pgEnum("numeric_subject_type", [
	"player",
	"team",
])

export const questions = pgTable("questions", {
	id: uuid("id").primaryKey().defaultRandom(),
	type: questionType("type").notNull(),
	category: questionCategory("category").notNull(),
	title: text("title").notNull(),
	// Nullable + set null on delete: deleting the account that created a
	// question shouldn't take the question (and everyone else's calls on it)
	// down with it - it's just orphaned instead, shown as "Deleted user".
	creatorId: uuid("creator_id").references(() => users.id, {
		onDelete: "set null",
	}),
	isOfficial: boolean("is_official").notNull().default(false),
	sportId: uuid("sport_id")
		.notNull()
		.references(() => sports.id, { onDelete: "restrict" }),
	leagueId: uuid("league_id")
		.notNull()
		.references(() => leagues.id, { onDelete: "restrict" }),

	// The single real-world matchup this question is about - set for a
	// question scoped to one specific game (a yes_no/over_under/numeric_guess
	// about tonight's game), null for anything that isn't (season awards, an
	// MVP race). set null on delete rather than restrict: a game going away
	// shouldn't take its questions down with it.
	gameId: uuid("game_id").references(() => games.id, { onDelete: "set null" }),

	// Resolution is manual - a human states where they checked, in their own
	// words. There's no fixed source list that actually fits every league, so
	// this is disclosure, not an integration.
	resolutionSource: text("resolution_source").notNull(),
	resolutionSourceUrl: text("resolution_source_url"),

	locksAt: timestamp("locks_at").notNull(),
	status: questionStatus("status").notNull().default("open"),
	resolvedAt: timestamp("resolved_at"),
	resolutionNote: text("resolution_note"),

	// over_under and numeric_guess share this - the stat being checked. statId
	// is the strong default (catalog-backed, consistent naming, groupable in a
	// picker); customStat is the escape hatch for anything not in the catalog
	// (e.g. RAPM, a season-long advanced metric) and is only used when statId
	// is null. Custom stats are harder for us to verify, which is inferable
	// from statId being null - no separate flag needed for that.
	statId: uuid("stat_id").references(() => stats.id, { onDelete: "restrict" }),
	customStat: text("custom_stat"),

	// over_under only
	ouLine: numeric("ou_line", { precision: 8, scale: 2, mode: "number" }),

	// yes_no, over_under, and numeric_guess - optional subject, null for a
	// game-wide over/under (or a yes_no with no single team/player it's about)
	numericSubjectType: numericSubjectType("numeric_subject_type"),
	subjectTeamId: uuid("subject_team_id").references(() => teams.id, {
		onDelete: "restrict",
	}),
	subjectPlayerId: uuid("subject_player_id").references(() => players.id, {
		onDelete: "restrict",
	}),
	numericTolerancePct: numeric("numeric_tolerance_pct", {
		precision: 4,
		scale: 3,
		mode: "number",
	}),
	numericActualValue: numeric("numeric_actual_value", {
		precision: 8,
		scale: 2,
		mode: "number",
	}),

	// multi_select only
	picksRequired: integer("picks_required"),

	// multiple_choice only. When true, this question doesn't start from a
	// fixed option pool - questionOptions rows for it get created on demand by
	// castCall itself (see the resolver) as callers pick real teams/players not
	// already in the pool, instead of all being pre-listed by the creator at
	// question-creation time. openFieldKind says which kind of entity backs
	// that pool; only meaningful (and set) when this is true.
	optionsOpenField: boolean("options_open_field").notNull().default(false),
	openFieldKind: numericSubjectType("open_field_kind"),

	createdAt: timestamp("created_at").notNull().defaultNow(),
})
export type Question = typeof questions.$inferSelect

// The option pool for multiple_choice, yes_no (fixed Yes/No pair), over_under
// (its two sides), and multi_select (the full candidate pool). teamId/playerId
// are set when the option actually is a real team or player (a championship
// field, an All-NBA ballot) - that's what backs search/autofill. Freeform
// options (Yes/No, an "other" category pick) leave both null and rely on label.
// For an optionsOpenField question, rows here are seeded incrementally by
// castCall rather than all inserted up front by the creator.
export const questionOptions = pgTable("question_options", {
	id: uuid("id").primaryKey().defaultRandom(),
	questionId: uuid("question_id")
		.notNull()
		.references(() => questions.id, { onDelete: "cascade" }),
	label: text("label").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	teamId: uuid("team_id").references(() => teams.id, { onDelete: "restrict" }),
	playerId: uuid("player_id").references(() => players.id, {
		onDelete: "restrict",
	}),
	// null until the question resolves
	isCorrect: boolean("is_correct"),
})
export type QuestionOption = typeof questionOptions.$inferSelect

// One row per user per question. numeric_guess scores entirely off the columns
// here (no options involved); every other type scores through callSelections.
export const calls = pgTable(
	"calls",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		questionId: uuid("question_id")
			.notNull()
			.references(() => questions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		caseText: text("case_text"),

		// numeric_guess only
		guessValue: numeric("guess_value", {
			precision: 8,
			scale: 2,
			mode: "number",
		}),
		conviction: integer("conviction"), // 1-100
		hitTolerance: boolean("hit_tolerance"),
		resultPoints: integer("result_points"),
		// The closeness multiplier (1.00-6.00) actually applied at resolution -
		// null until resolved, and null forever on a miss (see
		// numericGuessPoints in @called-my-shot/scoring). Persisted rather than
		// left for the client to reconstruct: unlike a selection's contrarian
		// tier (derivable live from fieldPct), closeness rank only exists once
		// every other hit on the question is known, which is resolve-time-only
		// information with no live equivalent.
		closenessMult: numeric("closeness_mult", {
			precision: 4,
			scale: 2,
			mode: "number",
		}),
		// What % of the WHOLE field (not just other hitters) guessed at least as
		// close to the actual value as this call did - the raw share
		// closenessMult above was derived from (see numericGuessPoints). Exposed
		// separately, not just left for the client to back out of the
		// multiplier, so the UI can explain "why this multiplier" (e.g. "62% of
		// the field guessed at least this close") with a real number instead of
		// inverting a curve on the frontend. Same resolve-time-only reasoning as
		// closenessMult - null until resolved, null forever on a miss.
		closenessFieldPct: numeric("closeness_field_pct", {
			precision: 5,
			scale: 2,
			mode: "number",
		}),

		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.questionId, t.userId),
		// The unique constraint above leads with question_id, so it can't serve
		// a `where user_id = ...` lookup - every points/leaderboard/career-stats
		// aggregate filters or groups by user_id alone.
		index("calls_user_id_idx").on(t.userId),
	],
)
export type Call = typeof calls.$inferSelect

// A call's picks for option-based types: exactly one row for multiple_choice /
// yes_no / over_under, up to picksRequired rows for multi_select. Conviction is
// tracked per selection since multi_select lets a caller set it independently
// per pick. The contrarian tier isn't stored here at all - it's computed once
// per option from the final field at resolution (see fieldPct/tierFor in
// lib/calls.ts), not snapshotted per selection at call time.
export const callSelections = pgTable(
	"call_selections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		callId: uuid("call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		optionId: uuid("option_id")
			.notNull()
			.references(() => questionOptions.id, { onDelete: "cascade" }),
		conviction: integer("conviction").notNull(), // 1-100
		resultPoints: integer("result_points"),
	},
	(t) => [unique().on(t.callId, t.optionId)],
)

// Denormalized per-(user, league) rollup - the only source leaderboards/
// career stats read from (see lib/points-aggregate.ts), rather than
// aggregating live over calls/callSelections on every read. One row per
// league a user has ever cast a call in; kept in sync transactionally by
// castCall (callCount +1 on cast), resolveQuestionInternal (points/
// resolvedCallCount/correctCount deltas on resolve, delta not overwrite, so
// a dispute overturn re-resolving a question doesn't double-count), and
// voidQuestion (reverses all four fields for every call on the voided
// question - callCount always, the others only when calls had already been
// scored, i.e. a disputed question being voided).
//
// Deliberately NOT a `points` column on `users` for the site-wide total -
// that would mean two independently-updated running totals (one here, one
// on users) that could drift if some future write path updates one and
// forgets the other. Instead the site-wide/all-leagues total is just
// sum(points) grouped by user_id over this table - cheap regardless of a
// user's call count because this table's size is bounded by leagues (an
// admin-curated catalog, realistically a couple dozen at most - see
// sports.ts's createLeague), not by call volume.
export const userLeagueStats = pgTable(
	"user_league_stats",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		points: integer("points").notNull().default(0),
		// Counts picks, not calls, for multi_select (matches scoreCalls'
		// pre-existing semantics) - one multi_select call with 3 resolved
		// selections adds 3 here, not 1.
		resolvedCallCount: integer("resolved_call_count").notNull().default(0),
		correctCount: integer("correct_count").notNull().default(0),
		// Unlike the three fields above, this counts calls (one per cast),
		// incremented at castCall time regardless of resolution status.
		callCount: integer("call_count").notNull().default(0),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.leagueId] }),
		index("user_league_stats_league_points_idx").on(t.leagueId, t.points),
	],
)
export type UserLeagueStats = typeof userLeagueStats.$inferSelect

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

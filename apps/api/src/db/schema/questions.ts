import {
	boolean,
	integer,
	numeric,
	pgEnum,
	pgTable,
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
	(t) => [unique().on(t.questionId, t.userId)],
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

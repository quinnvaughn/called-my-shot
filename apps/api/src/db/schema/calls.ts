import { GLOAT_MESSAGES } from "@called-my-shot/schemas"
import {
	boolean,
	index,
	integer,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core"
import { questionOptions, questions } from "./questions"
import { users } from "./users"

// Why a call on a settled question carries no result. Its resultPoints and
// hitTolerance stay null either way - the same "not scored" signal an
// unresolved call has - so nothing that sums or badges results can mistake it
// for a loss. question_voided: the question itself was voided.
// creator_sole_caller: the creator resolved a question nobody else called, so
// their own call on it doesn't score.
export const callUnscoredReason = pgEnum("call_unscored_reason", [
	"question_voided",
	"creator_sole_caller",
])
export type CallUnscoredReason = (typeof callUnscoredReason.enumValues)[number]

// One row per user per question. The two numeric_guess shapes score entirely
// off the columns here (no options involved); every other shape scores
// through callSelections.
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

		// numeric_guess only. scale 3, not 2 - see questions.ouLine.
		guessValue: numeric("guess_value", {
			precision: 8,
			scale: 3,
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
		// See callUnscoredReason above - null for every call that scores, or
		// will once its question resolves.
		unscoredReason: callUnscoredReason("unscored_reason"),

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

// A call's picks for option-based shapes: exactly one row for every shape
// except player_season_award/team_season_award, which allow up to
// picksRequired rows. Conviction is tracked per selection since those award
// shapes let a caller set it independently per pick. The contrarian tier
// isn't stored here at all - it's computed once per option from the final
// field at resolution (see fieldPct/tierFor in lib/calls.ts), not
// snapshotted per selection at call time.
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

// The line the winning side of a fade picked - see GLOAT_MESSAGES.
export const gloatMessage = pgEnum("gloat_message", GLOAT_MESSAGES)

// One call aimed at another: the fader took the other side of a two-sided
// question and named whose call they were betting against. The fader's call
// is an ordinary call scored the ordinary way - this row adds only who it was
// aimed at, so the target's page can list its doubters.
//
// faderCallId is unique because a call fades at most one other call. A fade
// is a choice of who to bet against, and letting one call fade everyone on
// the other side would turn it into a label every opposing call carries.
//
// Who won is never stored. It's read live off the options' isCorrect (see
// fadeWinner in lib/fades.ts), so a re-resolve or an overturned dispute moves
// it without anything here needing an update.
export const callFades = pgTable(
	"call_fades",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		faderCallId: uuid("fader_call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		targetCallId: uuid("target_call_id")
			.notNull()
			.references(() => calls.id, { onDelete: "cascade" }),
		// Set when the target redid onto the fader's side after being faded.
		// Kept rather than deleting the fade, because being talked onto the
		// other side is the most pointed thing a fade can record. Redos are
		// one per call, so a flip is final.
		targetFlippedAt: timestamp("target_flipped_at"),
		// When each side used its one gloat, and the line it sent. Only the
		// winning side can set its pair, and a gloat only shows while that
		// side is still the winner. The target's gloat is sent to every
		// doubter who was wrong at once, so it lands on each of their rows.
		faderGloatedAt: timestamp("fader_gloated_at"),
		faderGloatMessage: gloatMessage("fader_gloat_message"),
		targetGloatedAt: timestamp("target_gloated_at"),
		targetGloatMessage: gloatMessage("target_gloat_message"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		unique().on(t.faderCallId),
		index("call_fades_target_call_id_idx").on(t.targetCallId),
	],
)
export type CallFade = typeof callFades.$inferSelect

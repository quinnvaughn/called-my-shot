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
		// What this counts for in a challenge: the same result without earliness
		// or the season-play weight (see numericGuessPoints and scoreSelections).
		// Written alongside resultPoints and cleared with it.
		challengePoints: integer("challenge_points"),
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
		// What % of the WHOLE field's conviction (not just other hitters')
		// guessed at least as close to the actual value as this call did - the
		// raw share closenessMult above was derived from (see
		// numericGuessPoints). Exposed separately, not just left for the client
		// to back out of the multiplier, so the UI can explain "why this
		// multiplier" (e.g. "62% of the field's points guessed at least this
		// close") with a real number instead of
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
		// On a season-long call, the weeks its caller played the league and
		// the weeks that counted, as of the question's first resolution (see
		// seasonPlayWeight). Set once so a re-resolve scores at the same
		// weight; null on every other call, and until then.
		seasonPlayWeeksPlayed: integer("season_play_weeks_played"),
		seasonPlayWeeksCounted: integer("season_play_weeks_counted"),
		// On a series question, how many of the series' games were final when
		// the call was made, and the share of its full points that leaves it
		// worth (see seriesStageWeight). Set with the call, and again by a redo,
		// which calls it anew; null on every other call.
		seriesGamesPlayed: integer("series_games_played"),
		seriesWeight: numeric("series_weight", {
			precision: 4,
			scale: 3,
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
		// The side's price when this pick was made: its option's lossRate,
		// winMult and modelHitRate, copied at the time (all null on an
		// unpriced side). A pick is scored at these, never at the option's
		// current price. Most questions' prices stop moving once anyone calls,
		// so the two agree; a series question's sides are repriced after every
		// game, and each pick keeps the price it was made at.
		lossRate: numeric("loss_rate", {
			precision: 4,
			scale: 3,
			mode: "number",
		}),
		winMult: numeric("win_mult", {
			precision: 4,
			scale: 2,
			mode: "number",
		}),
		modelHitRate: numeric("model_hit_rate", {
			precision: 4,
			scale: 3,
			mode: "number",
		}),
		resultPoints: integer("result_points"),
		// What this counts for in a challenge: the same result without earliness
		// or the season-play weight (see numericGuessPoints and scoreSelections).
		// Written alongside resultPoints and cleared with it.
		challengePoints: integer("challenge_points"),
	},
	(t) => [unique().on(t.callId, t.optionId)],
)

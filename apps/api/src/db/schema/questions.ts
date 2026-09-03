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
import { games, leagues, players, seasons, sports, stats, teams } from "./sports"
import { users } from "./users"

// Replaces the old type + category + numericSubjectType + optionsOpenField/
// openFieldKind combination - one value per concrete kind of question the
// app supports, each fully determining its required fields, its
// questionOptions/pool mechanism, and its generated title template (see
// generateQuestionTitle in lib/question-title.ts). No generic axes left to
// combine incorrectly.
export const questionShape = pgEnum("question_shape", [
	"player_stat_over_under",
	"team_stat_over_under",
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"game_total_over_under",
	"player_stat_numeric_guess",
	"team_stat_numeric_guess",
	"player_vs_player",
	"player_vs_player_season",
	"team_vs_team",
	"yes_no_prop",
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
	// Season-scoped sibling of team_stat_numeric_guess - guess a team's total
	// for the season (win totals: statId "Wins") rather than a single game.
	// gameId stays null, same as team_season_stat_over_under.
	"team_season_stat_numeric_guess",
	// "Who gets the most X in this game" - pool is auto-built from just the
	// two teams in gameId (required), not the whole league the way
	// player_season_award's pool is. Caller picks exactly 1; resolution can
	// still mark >1 questionOptions.isCorrect on a real-world tie, same
	// mechanism the award shapes already use.
	"player_game_stat_leader",
])

// player_season_stat_over_under/team_season_stat_over_under only - whether
// ouLine is read as a season total ("over/under 334 3-Pointers Made") or a
// per-game rate ("over/under 30 Points per game"). Nothing else in the shape
// implies this either way, so it's its own required field rather than an
// assumption baked into how the number's presented.
export const statAggregation = pgEnum("stat_aggregation", ["total", "per_game"])

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

// player_season_award/team_season_award only - which verb the single-winner
// title reads with ("Who will WIN the MVP?" vs "Who will BE the AL Gold
// Glove - 1B?"). Explicit rather than inferred from awardName text, same
// reasoning as every other award field below: a trophy-style award (MVP,
// Cy Young) and a role/selection-style award (an All-NBA slot, a
// per-position Gold Glove) aren't distinguishable from picksRequired or the
// name alone. Not used when picksRequired > 1 - "Pick the X (5)" already
// reads fine for both kinds.
export const awardVerb = pgEnum("award_verb", ["win", "be"])

export const questions = pgTable("questions", {
	id: uuid("id").primaryKey().defaultRandom(),
	shape: questionShape("shape").notNull(),
	// Server-generated from shape's structured fields at creation time (see
	// generateQuestionTitle in lib/question-title.ts) - never trusted from
	// client input, so every question's title is consistent in format/voice
	// and there's no freeform text to moderate.
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

	// Which real-world season this question belongs to - always server-
	// derived, never creator-supplied (there's no seasonId field in
	// createQuestionSchema). Game-scoped: copied from the picked game's own
	// seasonId. Game-less (season awards, an MVP race, the season-scoped
	// over/under and player-vs-player shapes): the league's current season at
	// creation time, resolved via getCurrentSeason (lib/seasons.ts) -
	// createQuestion refuses to create a question at all if that comes back
	// null (a league with nothing synced yet). Restrict, not cascade/set null
	// - a season with questions under it shouldn't be deletable out from under
	// them, same reasoning as games.seasonId.
	seasonId: uuid("season_id")
		.notNull()
		.references(() => seasons.id, { onDelete: "restrict" }),

	// Resolution is manual - a human states where they checked, in their own
	// words. There's no fixed source list that actually fits every league, so
	// this is disclosure, not an integration.
	resolutionSource: text("resolution_source").notNull(),
	resolutionSourceUrl: text("resolution_source_url"),

	locksAt: timestamp("locks_at").notNull(),
	status: questionStatus("status").notNull().default("open"),
	resolvedAt: timestamp("resolved_at"),
	resolutionNote: text("resolution_note"),

	// The *_over_under and *_numeric_guess shapes share this - the stat being
	// checked. statId is the strong default (catalog-backed, consistent
	// naming, groupable in a picker); customStat is the escape hatch for
	// anything not in the catalog (e.g. RAPM, a season-long advanced metric)
	// and is only used when statId is null. Custom stats are harder for us to
	// verify, which is inferable from statId being null - no separate flag
	// needed for that. player_vs_player also uses statId (required, no
	// customStat fallback - it's what the comparison is actually about).
	statId: uuid("stat_id").references(() => stats.id, { onDelete: "restrict" }),
	customStat: text("custom_stat"),

	// *_over_under shapes only. scale 3, not 2 - a rate-stat line (batting
	// average, e.g. .275) needs a third decimal place a counting-stat line
	// (yards, points) never uses.
	ouLine: numeric("ou_line", { precision: 8, scale: 3, mode: "number" }),

	// player_season_stat_over_under/team_season_stat_over_under only - see
	// statAggregation above.
	statAggregation: statAggregation("stat_aggregation"),

	// player_stat_over_under/numeric_guess and team_stat_over_under/
	// numeric_guess set exactly one of these (required); yes_no_prop sets at
	// most one (optional - null for a subject-less proposition). Which one is
	// meaningful for a given row is implied by its shape, not stored
	// separately.
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
	// Set instead of numericTolerancePct when the picked stat's tolerance tier
	// is "absolute" mode (a rate stat) rather than "percentage" - exactly one
	// of the two is non-null for a numeric_guess question, mirroring which of
	// the tier's own two interpretations of toleranceValue applies. See
	// ToleranceSpec in @called-my-shot/scoring for how resolution reads
	// whichever one is set.
	numericToleranceAbsolute: numeric("numeric_tolerance_absolute", {
		precision: 4,
		scale: 3,
		mode: "number",
	}),
	// scale 3, not 2 - see ouLine above.
	numericActualValue: numeric("numeric_actual_value", {
		precision: 8,
		scale: 3,
		mode: "number",
	}),

	// player_season_award/team_season_award only - how many winners the award
	// has (1 for MVP, 5 for an All-NBA team). Pool is always the full league
	// roster regardless of this number (see questionOptions) - there's no
	// "unknown candidate list" case, so nothing here ever grows on demand.
	picksRequired: integer("picks_required"),

	// yes_no_prop only - the proposition itself (e.g. "signs a contract
	// extension by March 1"), combined with the optional subject above into
	// the generated title ("Will {subject} {eventClause}?"). The one piece of
	// a yes/no question that genuinely can't be enumerated from catalog data.
	eventClause: text("event_clause"),

	// player_season_award/team_season_award/player_award_finalists only - the
	// award's name (e.g. "MVP"), same "can't be enumerated" reasoning as
	// eventClause above.
	awardName: text("award_name"),

	// player_season_award/team_season_award only - see awardVerb pgEnum above.
	awardVerb: awardVerb("award_verb"),

	// player_season_award/team_season_award only - narrows the auto-built pool
	// (see questionOptions) from the whole league down to teams.conference IN
	// (...) these values. Null (not an empty array) keeps today's whole-league
	// pool. Needed for awards that are genuinely scoped to half a league in
	// reality (AL MVP vs NL MVP are two separate real awards, not one merged
	// field) rather than a real league-wide award that just happens to have
	// conferences (NBA/NFL MVP, which stay null/whole-league). An array (not a
	// single value) lets a race that spans multiple conferences/divisions/
	// positions - e.g. Cy Young, awarded across both starters and relievers -
	// be expressed as one pool instead of forcing several separate questions.
	awardConferences: text("award_conferences").array(),
	// Narrows further to teams.division IN (...) - requires awardConferences
	// also be set, since a division name like "South" repeats across
	// conferences.
	awardDivisions: text("award_divisions").array(),
	// player_season_award only - narrows further to players.position IN (...),
	// for Gold-Glove/Silver-Slugger-style awards with one winner per position
	// per league-half, or a multi-position race like Cy Young (SP + RP).
	awardPositions: text("award_positions").array(),
	// player_season_award only - narrows further to players.seasonsInLeague IN
	// (...), for a genuine exact-experience-year race (e.g. [1] for a "best
	// second-year player" poll). An array, not a min/max range, for the same
	// reason awardPositions is one - most of these races pick out a single
	// exact value, not a band. NOT used for Rookie of the Year - see
	// awardRookieOnly below.
	awardSeasonsInLeague: integer("award_seasons_in_league").array(),
	// player_season_award only - when true, narrows the pool to
	// players.rookieEligible = true. This is the mechanism for every real
	// Rookie of the Year question regardless of sport - unlike
	// awardSeasonsInLeague, it isn't "zero prior seasons in the league" (wrong
	// for e.g. MLB, where a brief prior-season call-up doesn't cost rookie
	// status) but whatever that sport's own rookie rule actually is, computed
	// at sync time (see players.rookieEligible in db/schema/sports.ts).
	awardRookieOnly: boolean("award_rookie_only"),

	createdAt: timestamp("created_at").notNull().defaultNow(),
})
export type Question = typeof questions.$inferSelect

// The option pool for every option-based shape: the two sides of an
// over_under/vs_player/vs_team, the fixed Yes/No pair, or an award's full
// candidate pool. teamId/playerId are set when the option actually is a real
// team or player (a championship field, an All-NBA ballot) - that's what
// backs search/autofill. The Yes/No pair leaves both null and relies on
// label alone.
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

		// numeric_guess only. scale 3, not 2 - see questions.ouLine above.
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

// Denormalized per-(user, season) rollup - the only source leaderboards/
// career stats read from (see lib/points-aggregate.ts), rather than
// aggregating live over calls/callSelections on every read. One row per
// season a user has ever cast a call in; kept in sync transactionally by
// castCall (callCount +1 on cast), resolveQuestionInternal (points/
// resolvedCallCount/correctCount deltas on resolve, delta not overwrite, so
// a dispute overturn re-resolving a question doesn't double-count), and
// voidQuestion (reverses all four fields for every call on the voided
// question - callCount always, the others only when calls had already been
// scored, i.e. a disputed question being voided).
//
// Deliberately NOT a `points` column on `users` for the site-wide total -
// that would mean an independently-updated running total that could drift
// from this table if some future write path updates one and forgets the
// other. All-time and per-league totals are both just sum(points) grouped by
// user_id over this table (all-time: no league_id filter; one league: filter
// it) - cheap regardless of a user's call count because this table's size is
// bounded by leagues x seasons (an admin-curated catalog, realistically a
// couple dozen leagues x a handful of seasons each at most - see sports.ts's
// createLeague), not by call volume. leagueId is denormalized directly
// rather than derived via a join through seasons, matching how
// questions.leagueId itself is stored directly rather than derived via
// game.leagueId - keeps the common "all-time within one league" query a
// plain WHERE, no join.
//
// seasonId is NOT NULL: every league this app supports is ESPN-covered, and
// run.ts's sync loop syncs a league's seasons before its games/before it's
// usable for question creation at all, so a resolvable season is as
// reliable as leagueId already is in practice. The rare case a question's
// seasonId can't be resolved (a brief sync-lag window right at a season
// boundary) simply isn't written here at all - see the seasonId-guarded call
// sites in graphql/types/question.ts.
export const userSeasonStats = pgTable(
	"user_season_stats",
	{
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		seasonId: uuid("season_id")
			.notNull()
			.references(() => seasons.id, { onDelete: "cascade" }),
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
		primaryKey({ columns: [t.userId, t.seasonId] }),
		index("user_season_stats_league_points_idx").on(t.leagueId, t.points),
	],
)
export type UserSeasonStats = typeof userSeasonStats.$inferSelect

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

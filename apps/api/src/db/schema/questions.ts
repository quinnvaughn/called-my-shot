import {
	boolean,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core"
import type { LineBasis } from "../../lib/game-questions/lines"
import { games } from "./games"
import { players } from "./players"
import { leagues, seasons, sports } from "./sports"
import { stats } from "./stats"
import { teams } from "./teams"
import { users } from "./users"

// Replaces the old type + category + numericSubjectType + optionsOpenField/
// openFieldKind combination - one value per concrete kind of question the
// app supports, each fully determining its required fields, its
// questionOptions/pool mechanism, and its generated title template (see
// generateQuestionTitle in packages/schemas/src/question-title.ts). No
// generic axes left to
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
	// Season-long team head-to-head ("more wins: Celtics or 76ers?") - two
	// teams, one team season stat, gameId stays null. Not admin-only the way
	// team_vs_team is: that one is derived 1:1 from a synced game and so can
	// duplicate, while this spans a whole season and has no game behind it.
	"team_vs_team_season",
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
	// Season-scoped sibling of player_game_stat_leader - "who puts up the most
	// X this season" over a hand-curated pool of 3+ players, gameId null (3,
	// not 2: a two-name pool is a head-to-head, which player_vs_player_season
	// already covers better). The
	// pool is the creator's own list rather than a derived roster (there's no
	// game to derive one from) and the stat may be a customStat, since the
	// advanced full-season metrics this exists for aren't in the catalog.
	"player_season_stat_leader",
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
	// Settled with no result - see markQuestionVoided in lib/void-question.ts.
	// The question and its calls stay; the moderation voidQuestion is the one
	// that deletes a question outright.
	"voided",
])

// Why a question is voided - null for every other status. subject_did_not_play:
// the player or team the question is about didn't play. game_not_completed:
// the game was postponed or abandoned. tie: a head-to-head ended level, a
// push. no_leader: nobody recorded the stat a leader question asks about.
// other: an admin's call, explained in resolutionNote.
export const questionVoidedReason = pgEnum("question_voided_reason", [
	"subject_did_not_play",
	"game_not_completed",
	"tie",
	"no_leader",
	"other",
])
export type QuestionVoidedReason =
	(typeof questionVoidedReason.enumValues)[number]

// Who set a question's current result - null until it has one. "system" is
// ESPN data read by a sync job; "creator" and "admin" are the two human
// resolve paths. Recorded so a creator grading their own question can be told
// apart from a result somebody else checked.
export const resolutionMethod = pgEnum("resolution_method", [
	"system",
	"creator",
	"admin",
])

// Whether a question's result comes from ESPN data ("system") or has to be
// entered by a person ("manual"). Decided at creation from the shape and stat
// (see resolutionModeFor in packages/schemas) - a system question is never
// resolved by its creator, only by the sync job or, when that can't settle
// it, an admin.
export const resolutionMode = pgEnum("resolution_mode", ["system", "manual"])

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
	// Creator-supplied free text. generateQuestionTitle
	// (packages/schemas/src/question-title.ts) only prefills the create form's
	// field from the shape's structured values - the creator can edit it from
	// there and the server stores whatever it's sent, so this is the one
	// moderatable string on a question. editQuestionTitle is how an admin
	// revises it after the fact, without voiding and recreating the question.
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
	// See resolutionMethod above. resolvedByUserId is the person behind a
	// creator or admin resolution - null for a system one, and set null if
	// that account is later deleted.
	resolutionMethod: resolutionMethod("resolution_method"),
	resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
		onDelete: "set null",
	}),
	resolutionMode: resolutionMode("resolution_mode").notNull().default("manual"),
	voidedReason: questionVoidedReason("voided_reason"),

	// The *_over_under and *_numeric_guess shapes share this - the stat being
	// checked. statId is the strong default (catalog-backed, consistent
	// naming, groupable in a picker); customStat is the escape hatch for
	// anything not in the catalog (e.g. RAPM, a season-long advanced metric)
	// and is only used when statId is null. Custom stats are harder for us to
	// verify, which is inferable from statId being null - no separate flag
	// needed for that. The vs-shapes and player_season_stat_leader take the
	// same statId-or-customStat pair - player_season_stat_leader especially
	// leans on the escape hatch, since it exists largely for those metrics.
	// player_game_stat_leader is the one shape that requires a catalog statId
	// with no fallback, because its pool is derived from synced rosters and
	// resolution is expected to come off the same synced box score.
	statId: uuid("stat_id").references(() => stats.id, { onDelete: "restrict" }),
	customStat: text("custom_stat"),

	// *_over_under shapes only. scale 3, not 2 - a rate-stat line (batting
	// average, e.g. .275) needs a third decimal place a counting-stat line
	// (yards, points) never uses.
	ouLine: numeric("ou_line", { precision: 8, scale: 3, mode: "number" }),

	// player_season_stat_over_under/team_season_stat_over_under (required) and
	// player_season_stat_leader (nullable there, and null for most of them) -
	// see statAggregation above.
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
	// at sync time (see players.rookieEligible in db/schema/players.ts).
	awardRookieOnly: boolean("award_rookie_only"),

	// Set on every question a sync job posts on a game - the who-wins question
	// (db/sync/sync-game-questions.ts) and the catalog ones
	// (db/sync/generate-game-questions.ts) - and null on everything a person
	// wrote. Format and slots are in lib/game-questions/generation-key.ts. The
	// unique index is what makes a rerun a no-op rather than a duplicate.
	generationKey: text("generation_key"),
	// A generated over/under's line inputs (LineBasis in
	// lib/game-questions/lines.ts), kept so lib/game-questions/line-calibration.ts can
	// compare where lines were set against how they resolved. Null on every
	// other question.
	lineBasis: jsonb("line_basis").$type<LineBasis>(),

	createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("questions_generation_key_idx").on(t.generationKey)])
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

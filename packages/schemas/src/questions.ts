import { match } from "ts-pattern"
import { z } from "zod"
import { ballotQuestionSchema } from "./ballots"

// Lowercase to match the values the GraphQL layer resolves these enums to
// server-side (see builder.enumType in apps/api/src/graphql/types/question.ts
// - e.g. PLAYER_STAT_OVER_UNDER resolves to "player_stat_over_under"), not
// the SCREAMING_SNAKE_CASE names used on the wire. The frontend form works in
// this same lowercase form and only upper-cases at the GraphQL call boundary.
//
// One value per concrete kind of question the app supports - replaces the
// old type + category + numericSubjectType + optionsOpenField/openFieldKind
// combination. Each shape fully determines its required fields below and its
// suggested title template (see generateQuestionTitle in
// ./question-title.ts) - there's no generic axis left that
// could combine into an invalid or nonsensical question.
// Display order matters here - QuestionTypePicker (apps/web/src/components/
// questions/create-question/question-type-picker.tsx) renders the shape
// grid straight off this array's order, not a separately curated list. Kept
// grouped by family (over/unders, numeric guesses, vs-shapes, yes/no) so a
// new shape lands next to its siblings, not tacked on wherever it happened
// to be added to this enum - team_season_stat_numeric_guess/
// player_game_stat_leader previously sat after the admin-only cluster below
// purely because they were appended last, even though neither is admin-only.
export const questionShapeSchema = z.enum([
	"player_stat_over_under",
	"team_stat_over_under",
	"player_season_stat_over_under",
	"team_season_stat_over_under",
	"game_total_over_under",
	"player_stat_numeric_guess",
	"team_stat_numeric_guess",
	"team_season_stat_numeric_guess",
	"player_vs_player",
	"player_vs_player_season",
	"team_vs_team_season",
	"player_game_stat_leader",
	"yes_no_prop",
	// Admin-only shapes grouped at the end - see ADMIN_ONLY_SHAPES below.
	"team_vs_team",
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
])
export type QuestionShape = z.infer<typeof questionShapeSchema>

// player_season_award/team_season_award only - see awardVerb on the
// questions table (apps/api/src/db/schema/questions.ts) for why this is its
// own explicit field rather than inferred from awardName.
export const awardVerbSchema = z.enum(["win", "be"])
export type AwardVerb = z.infer<typeof awardVerbSchema>

// player_season_stat_over_under/team_season_stat_over_under only - see
// statAggregation on the questions table (apps/api/src/db/schema/
// questions.ts) for why this exists.
export const statAggregationSchema = z.enum(["total", "per_game"])
export type StatAggregation = z.infer<typeof statAggregationSchema>

const createQuestionOptionSchema = z.object({
	label: z.string().trim().min(1, "Option can't be empty"),
	teamId: z.string().uuid().optional(),
	playerId: z.string().uuid().optional(),
})

// Shapes whose title needs a whole extra sentence's worth of freeform
// creator input, not just picking from catalog data - see ADMIN_ONLY_SHAPES
// and generateQuestionTitle. Both eventClause and awardName describe
// something that genuinely isn't enumerable (a specific proposition, an
// award's real-world name).
const AWARD_SHAPES = [
	"player_season_award",
	"team_season_award",
	"player_award_finalists",
] as const

// player_season_award/team_season_award/player_award_finalists only run -
// there's no fixed nominee list to curate from (nobody knows next year's MVP
// finalists yet), so these are always admin-authored, never a regular
// creator's call. team_vs_team joins them for a different reason: it's
// derived 1:1 from a synced game (see apps/api/src/db/sync/sync-games.ts),
// so letting any creator post one risks duplicate matchup questions for the
// same game - the sync job is what should create these, not creators.
// Enforced here (isOfficial must be true) and again by the resolver's own
// admin-only authorization check on top.
const ADMIN_ONLY_SHAPES = [...AWARD_SHAPES, "team_vs_team"] as const

// A resolution source URL is rendered as a real, clickable link on the
// question page, so it can only ever be http/https - z.url() on its own
// accepts any scheme, `javascript:` and `data:` included. The host has to
// look like a host too (dotted, no whitespace): a bare typo should fail here
// rather than turn into a dead link nobody can tell apart from a real source.
// Matched by pattern rather than the URL constructor, which this package has
// no ambient types for - it deliberately builds against the bare ES lib so
// the same schemas run in the browser and on the server.
const HTTP_URL_PATTERN =
	/^https?:\/\/[^\s/?#@:]+(?:\.[^\s/?#@:]+)+(?::\d+)?(?:[/?#]\S*)?$/i

// A scheme-less "databallr.com/stats" is the shape people actually paste, so
// it's normalized to https:// instead of rejected. Empty stays empty - the
// field is optional everywhere it's used.
export const resolutionSourceUrlSchema = z
	.string()
	.trim()
	.transform((value) =>
		value === "" || /^[a-z][a-z0-9+.-]*:/i.test(value)
			? value
			: `https://${value.replace(/^\/+/, "")}`,
	)
	.refine(
		(value) => value === "" || HTTP_URL_PATTERN.test(value),
		"Enter a valid URL",
	)

// One flat object rather than a discriminated union on `shape` - a single
// stable shape is what the create-question form's field bindings need, and
// the per-shape requirements below are cross-field concerns anyway (an
// over/under's line only makes sense once you already know it's an
// over/under), which is exactly what superRefine is for.
//
// locksAt stays a plain string (not z.coerce.date()) so it binds directly to
// a native <input type="datetime-local"> value without a Date round-trip in
// the form layer - it's parsed to a Date only where that's actually needed
// (the refine below, and the API resolver's insert).
//
export const createQuestionSchema = z
	.object({
		shape: questionShapeSchema,

		// Required, same as every other creator-facing field - but the
		// create-question form prefills it from generateQuestionTitle the
		// moment there's enough filled in to generate one, so a creator only
		// ever has to type it by hand when the generated phrasing reads
		// awkwardly (an unusual stat/award name especially, e.g. "Who will win
		// the Offensive Rating?"). Not a fallback-to-generated-if-blank field -
		// the server trusts this value as-is.
		title: z.string().trim().min(1, "Give it a title"),
		sportId: z.string().uuid("Pick a sport"),
		leagueId: z.string().uuid("Pick a league"),

		// The single real-world matchup this question is about, if any - see
		// gameId on the questions table. Required for game_total_over_under,
		// team_vs_team, player_stat_numeric_guess, team_stat_numeric_guess,
		// player_stat_over_under, and team_stat_over_under - season-long over/
		// under lines are their own separate shapes now
		// (player_season_stat_over_under/team_season_stat_over_under), which
		// never take a gameId at all, so there's no shape left where this field
		// is ambiguous about which one it means. When set, the API resolver
		// derives locksAt from the game's own startsAt instead of trusting this
		// input's locksAt string, so a stale/tampered value here can't desync
		// the two.
		gameId: z.string().uuid().optional(),

		resolutionSource: z.string().trim().min(1, "Say where you'll check this"),
		resolutionSourceUrl: resolutionSourceUrlSchema.default(""),
		locksAt: z
			.string()
			.min(1, "Pick a lock time")
			.refine(
				(value) => !Number.isNaN(new Date(value).getTime()),
				"Pick a valid lock time",
			)
			.refine(
				(value) => new Date(value).getTime() > Date.now(),
				"Lock time must be in the future",
			),
		isOfficial: z.boolean().optional(),

		// Admin-only placement into a Ballot (a Gold Glove race's 9 positions, a
		// week of games) - see the isOfficial requirement in the superRefine
		// below. Absent entirely for the overwhelming majority of questions,
		// which aren't part of any ballot.
		ballot: ballotQuestionSchema.optional(),

		// player_vs_player (exactly 2, playerId required on each), award pools
		// (player_season_award/team_season_award, auto-derived client-side from
		// the full league roster), player_award_finalists (2+, playerId
		// required on each). team_vs_team submits none - the resolver derives
		// its two sides from the picked game.
		options: z.array(createQuestionOptionSchema).default([]),

		// *_over_under, *_numeric_guess, player_vs_player
		statId: z.string().uuid().optional(),
		customStat: z.string().trim().default(""),

		// *_over_under only
		ouLine: z.number().optional(),

		// player_season_stat_over_under/team_season_stat_over_under only
		statAggregation: statAggregationSchema.optional(),

		// player_stat_over_under/numeric_guess (required), team_stat_over_under/
		// numeric_guess (required), yes_no_prop (optional - null for a
		// subject-less proposition)
		subjectTeamId: z.string().uuid().optional(),
		subjectPlayerId: z.string().uuid().optional(),

		// player_season_award/team_season_award only - how many winners the
		// award has (1 for MVP, 5 for an All-NBA team).
		picksRequired: z.number().int().optional(),

		// player_season_award/team_season_award only - see awardVerbSchema above.
		awardVerb: awardVerbSchema.optional(),

		// yes_no_prop only - the proposition itself, e.g. "signs a contract
		// extension by March 1". Combines with the optional subject above into
		// the generated title.
		eventClause: z.string().trim().default(""),

		// player_season_award/team_season_award/player_award_finalists only -
		// the award's real name, e.g. "MVP".
		awardName: z.string().trim().default(""),

		// player_season_award/team_season_award only - narrows the pool the
		// resolver derives (see requirePool below and createQuestion's own
		// server-side derivation) from the whole league down to a
		// teams.conference IN (...) match, e.g. ["AL"] for an AL-only MVP race,
		// or ["AL", "NL"] to cover both leagues' award races as one pool. An
		// empty array (not any real conference) means whole-league, matching
		// every other optional filter field's convention here.
		awardConferences: z.array(z.string()).default([]),
		// Narrows further to teams.division IN (...) - requires awardConferences
		// also be non-empty (see requireConferenceBeforeDivision below), since a
		// division name like "South" repeats across conferences.
		awardDivisions: z.array(z.string()).default([]),
		// player_season_award only - narrows further to players.position IN
		// (...), for Gold-Glove/Silver-Slugger-style one-winner-per-position
		// awards, or a multi-position race like Cy Young (SP + RP).
		awardPositions: z.array(z.string()).default([]),
		// player_season_award only - narrows further to players.seasonsInLeague
		// IN (...), for a genuine exact-experience-year race (e.g. [1] for a
		// "best second-year player" poll). Empty array means no experience
		// narrowing, same convention as every other award filter here. NOT used
		// for Rookie of the Year - see awardRookieOnly below.
		awardSeasonsInLeague: z.array(z.number().int().nonnegative()).default([]),
		// player_season_award only - when true, narrows the pool to
		// players.rookieEligible = true. The mechanism for every real Rookie of
		// the Year question regardless of sport - see players.rookieEligible's
		// comment in db/schema/sports.ts for why this isn't just
		// awardSeasonsInLeague: [0].
		awardRookieOnly: z.boolean().default(false),
	})
	.superRefine((data, ctx) => {
		if (
			ADMIN_ONLY_SHAPES.includes(
				data.shape as (typeof ADMIN_ONLY_SHAPES)[number],
			) &&
			!data.isOfficial
		) {
			ctx.addIssue({
				code: "custom",
				path: ["isOfficial"],
				message: "This kind of question can only be posted as official",
			})
		}

		// A ballot is always an admin-curated grouping - a question placed into
		// one is always attributed to the platform account, never a regular
		// creator's own byline, same as the award shapes above.
		if (data.ballot && !data.isOfficial) {
			ctx.addIssue({
				code: "custom",
				path: ["isOfficial"],
				message: "Ballot questions must be posted as official",
			})
		}

		function requireStat() {
			if (!data.statId && !data.customStat.trim()) {
				ctx.addIssue({
					code: "custom",
					path: ["customStat"],
					message: "Pick a stat",
				})
			}
		}

		function requireOuLine() {
			if (data.ouLine === undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["ouLine"],
					message: "Set the line",
				})
			} else if (Number.isInteger(data.ouLine)) {
				// A whole-number line the actual result can land on exactly isn't
				// an over/under anymore - there's no push/void outcome anywhere in
				// this app (resolution just marks one option isCorrect), so a tie
				// has no defined result.
				ctx.addIssue({
					code: "custom",
					path: ["ouLine"],
					message: "Can't be a whole number - the result could land exactly on it",
				})
			}
		}

		function requireCatalogStat() {
			// No customStat fallback - the tolerance band comes from the stat's
			// tolerance tier (see createQuestion's resolver), and a freeform stat
			// has no tier to look one up from.
			if (!data.statId) {
				ctx.addIssue({
					code: "custom",
					path: ["statId"],
					message: "Pick a stat from the list",
				})
			}
		}

		function requireAwardName() {
			if (!data.awardName.trim()) {
				ctx.addIssue({
					code: "custom",
					path: ["awardName"],
					message: "Name the award",
				})
			}
		}

		function requirePool(kind: "team" | "player", minSize: number) {
			const pool = data.options ?? []
			if (pool.length < minSize) {
				ctx.addIssue({
					code: "custom",
					path: ["options"],
					message: `Pool must have at least ${minSize} ${kind}s`,
				})
			}
			pool.forEach((option, index) => {
				if (kind === "player" ? !option.playerId : !option.teamId) {
					ctx.addIssue({
						code: "custom",
						path: ["options", index, "label"],
						message: `Pick a real ${kind} from the list`,
					})
				}
			})
		}

		// The exactly-2-named-sides rule the vs-shapes share
		// (player_vs_player, player_vs_player_season, team_vs_team_season).
		// Distinct from requirePool above: a pool is a curated list of any size
		// where duplicates just mean a sloppy pool, while these shapes are a
		// head-to-head - two sides, and the same side twice isn't a matchup at
		// all. team_vs_team is not one of these; it derives its two sides from
		// the picked game instead of submitting options.
		function requireTwoDistinct(kind: "team" | "player") {
			const idOf = (option: { teamId?: string; playerId?: string }) =>
				kind === "player" ? option.playerId : option.teamId
			const sides = data.options ?? []
			if (sides.length !== 2) {
				ctx.addIssue({
					code: "custom",
					path: ["options"],
					message: `Pick exactly 2 ${kind}s`,
				})
			}
			sides.forEach((option, index) => {
				if (!idOf(option)) {
					ctx.addIssue({
						code: "custom",
						path: ["options", index, "label"],
						message: `Pick a real ${kind} from the list`,
					})
				}
			})
			if (
				sides.length === 2 &&
				idOf(sides[0] ?? {}) &&
				idOf(sides[0] ?? {}) === idOf(sides[1] ?? {})
			) {
				ctx.addIssue({
					code: "custom",
					path: ["options", 1, "label"],
					message: `Pick two different ${kind}s`,
				})
			}
		}

		function requireConferenceBeforeDivision() {
			if (data.awardDivisions.length > 0 && data.awardConferences.length === 0) {
				ctx.addIssue({
					code: "custom",
					path: ["awardConferences"],
					message: "Pick a conference before narrowing to a division",
				})
			}
		}

		function requireGame() {
			if (!data.gameId) {
				ctx.addIssue({
					code: "custom",
					path: ["gameId"],
					message: "Pick a game",
				})
			}
		}

		function requireStatAggregation() {
			if (!data.statAggregation) {
				ctx.addIssue({
					code: "custom",
					path: ["statAggregation"],
					message: "Say whether that's a total or a per-game average",
				})
			}
		}

		function requireAwardVerb() {
			if (!data.awardVerb) {
				ctx.addIssue({
					code: "custom",
					path: ["awardVerb"],
					message: "Say whether callers win it or be it",
				})
			}
		}

		match(data.shape)
			.with("player_stat_over_under", () => {
				if (!data.subjectPlayerId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectPlayerId"],
						message: "Pick a player",
					})
				}
				requireGame()
				requireOuLine()
				requireStat()
			})
			.with("team_stat_over_under", () => {
				if (!data.subjectTeamId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectTeamId"],
						message: "Pick a team",
					})
				}
				requireGame()
				requireOuLine()
				requireStat()
			})
			.with("player_season_stat_over_under", () => {
				if (!data.subjectPlayerId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectPlayerId"],
						message: "Pick a player",
					})
				}
				requireOuLine()
				requireStat()
				requireStatAggregation()
			})
			.with("team_season_stat_over_under", () => {
				if (!data.subjectTeamId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectTeamId"],
						message: "Pick a team",
					})
				}
				requireOuLine()
				requireStat()
				requireStatAggregation()
			})
			.with("game_total_over_under", () => {
				requireGame()
				requireOuLine()
				requireStat()
			})
			.with("player_stat_numeric_guess", () => {
				if (!data.subjectPlayerId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectPlayerId"],
						message: "Pick a player",
					})
				}
				requireGame()
				requireCatalogStat()
			})
			.with("team_stat_numeric_guess", () => {
				if (!data.subjectTeamId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectTeamId"],
						message: "Pick a team",
					})
				}
				requireGame()
				requireCatalogStat()
			})
			.with("player_vs_player", "player_vs_player_season", (matchedShape) => {
				requireStat()
				if (matchedShape === "player_vs_player") requireGame()
				if (matchedShape === "player_vs_player_season") {
					requireStatAggregation()
				}
				requireTwoDistinct("player")
			})
			// Season-long team head-to-head ("more wins: Celtics or 76ers?").
			// Never takes a gameId - it spans the whole season, so unlike
			// team_vs_team there is no synced game to derive it from, which is
			// also why it is not admin-only: nothing to duplicate.
			.with("team_vs_team_season", () => {
				requireStat()
				requireStatAggregation()
				requireTwoDistinct("team")
			})
			.with("team_vs_team", () => {
				requireGame()
			})
			.with("yes_no_prop", () => {
				if (!data.eventClause.trim()) {
					ctx.addIssue({
						code: "custom",
						path: ["eventClause"],
						message: "Say what's being predicted",
					})
				}
				if (data.subjectTeamId && data.subjectPlayerId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectPlayerId"],
						message: "Pick a player or a team, not both",
					})
				}
			})
			.with("player_season_award", () => {
				requireAwardName()
				requireAwardVerb()
				if (!data.picksRequired || data.picksRequired < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["picksRequired"],
						message: "Picks required must be at least 1",
					})
				}
				requireConferenceBeforeDivision()
				requirePool("player", data.picksRequired ?? 1)
			})
			.with("team_season_award", () => {
				requireAwardName()
				requireAwardVerb()
				if (!data.picksRequired || data.picksRequired < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["picksRequired"],
						message: "Picks required must be at least 1",
					})
				}
				requireConferenceBeforeDivision()
				requirePool("team", data.picksRequired ?? 1)
			})
			.with("player_award_finalists", () => {
				requireAwardName()
				requirePool("player", 2)
			})
			.with("team_season_stat_numeric_guess", () => {
				if (!data.subjectTeamId) {
					ctx.addIssue({
						code: "custom",
						path: ["subjectTeamId"],
						message: "Pick a team",
					})
				}
				requireCatalogStat()
			})
			.with("player_game_stat_leader", () => {
				requireGame()
				requireCatalogStat()
				requirePool("player", 2)
			})
			.exhaustive()
	})
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>

// One call selection - an option the caller picked plus how much conviction
// they put behind that specific pick. player_season_award/team_season_award
// are the only shapes that submit more than one of these; every other
// option-based shape submits exactly one (enforced below, since the count
// that's valid depends on question shape, which this schema doesn't know on
// its own).
const castCallSelectionSchema = z.object({
	optionId: z.string().uuid(),
	conviction: z.number().int().min(1, "Conviction must be 1-100").max(100, "Conviction must be 1-100"),
})

// Same flat-object-plus-superRefine shape as createQuestionSchema. `shape` is
// supplied by the resolver from the question it already had to load (for the
// lock/status checks), not taken from client input - a client claiming a
// different shape than the question actually is would otherwise let it dodge
// these per-shape rules entirely.
export const castCallSchema = z
	.object({
		shape: questionShapeSchema,
		questionId: z.string().uuid(),
		caseText: z.string().trim().max(600, "Keep it under 600 characters").default(""),

		// player_stat_numeric_guess, team_stat_numeric_guess only
		guessValue: z.number().optional(),
		conviction: z
			.number()
			.int()
			.min(1, "Conviction must be 1-100")
			.max(100, "Conviction must be 1-100")
			.optional(),

		// Every other shape: exactly 1, except player_season_award/
		// team_season_award (>=1, exact count checked against the question's
		// picksRequired in the resolver, which is the only place that number is
		// known)
		selections: z.array(castCallSelectionSchema).default([]),
	})
	.superRefine((data, ctx) => {
		match(data.shape)
			.with(
				"player_stat_numeric_guess",
				"team_stat_numeric_guess",
				"team_season_stat_numeric_guess",
				() => {
					if (data.guessValue === undefined || Number.isNaN(data.guessValue)) {
						ctx.addIssue({
							code: "custom",
							path: ["guessValue"],
							message: "Enter your guess",
						})
					}
					if (data.conviction === undefined) {
						ctx.addIssue({
							code: "custom",
							path: ["conviction"],
							message: "Set your conviction",
						})
					}
				},
			)
			.with("player_season_award", "team_season_award", () => {
				if (data.selections.length < 1) {
					ctx.addIssue({
						code: "custom",
						path: ["selections"],
						message: "Pick at least one",
					})
				}
			})
			.with(
				"player_stat_over_under",
				"team_stat_over_under",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"game_total_over_under",
				"player_vs_player",
				"player_vs_player_season",
				"team_vs_team",
				"team_vs_team_season",
				"yes_no_prop",
				"player_award_finalists",
				"player_game_stat_leader",
				() => {
					if (data.selections.length !== 1) {
						ctx.addIssue({
							code: "custom",
							path: ["selections"],
							message: "Pick one",
						})
					}
				},
			)
			.exhaustive()
	})
export type CastCallInput = z.infer<typeof castCallSchema>

// Same "shape supplied by the resolver, not the client" reasoning as
// castCallSchema above - a question's own shape isn't something a resolve
// call should be able to override either.
export const resolveQuestionSchema = z
	.object({
		shape: questionShapeSchema,
		correctOptionIds: z.array(z.string().uuid()).default([]),
		actualValue: z.number().optional(),
		resolutionNote: z.string().trim().max(500, "Keep it under 500 characters").default(""),
	})
	.superRefine((data, ctx) => {
		match(data.shape)
			.with(
				"player_stat_numeric_guess",
				"team_stat_numeric_guess",
				"team_season_stat_numeric_guess",
				() => {
					if (data.actualValue === undefined || Number.isNaN(data.actualValue)) {
						ctx.addIssue({
							code: "custom",
							path: ["actualValue"],
							message: "Enter the actual value",
						})
					}
				},
			)
			.with(
				"player_season_award",
				"team_season_award",
				// Joins the award shapes, not the exactly-1 bucket below - a
				// real-world tie for "most points in this game" is exactly as
				// valid an outcome as a tie for an award race, and resolution
				// should be able to mark both options correct the same way.
				"player_game_stat_leader",
				() => {
					// Deliberately not compared against picksRequired - a real outcome
					// can produce fewer genuine winners than the number of picks callers
					// were asked to make, and that's a valid result, not an error.
					if (data.correctOptionIds.length < 1) {
						ctx.addIssue({
							code: "custom",
							path: ["correctOptionIds"],
							message: "Pick at least one correct option",
						})
					}
				},
			)
			.with(
				"player_stat_over_under",
				"team_stat_over_under",
				"player_season_stat_over_under",
				"team_season_stat_over_under",
				"game_total_over_under",
				"player_vs_player",
				"player_vs_player_season",
				"team_vs_team",
				"team_vs_team_season",
				"yes_no_prop",
				"player_award_finalists",
				() => {
					if (data.correctOptionIds.length !== 1) {
						ctx.addIssue({
							code: "custom",
							path: ["correctOptionIds"],
							message: "Pick exactly one correct option",
						})
					}
				},
			)
			.exhaustive()
	})
export type ResolveQuestionInput = z.infer<typeof resolveQuestionSchema>

export const fileDisputeSchema = z.object({
	questionId: z.string().uuid(),
	reason: z
		.string()
		.trim()
		.min(1, "Say why you're disputing this")
		.max(500, "Keep it under 500 characters"),
})
export type FileDisputeInput = z.infer<typeof fileDisputeSchema>

import { builder } from "../../builder"

// One value per concrete kind of question the app supports - replaces the
// old QuestionType + QuestionCategory + NumericSubjectType + open-field-
// toggle combination. Each shape fully determines its required fields and
// its suggested title (see generateQuestionTitle in
// packages/schemas/src/question-title.ts).
export const QuestionShape = builder.enumType("QuestionShape", {
	values: {
		PLAYER_STAT_OVER_UNDER: { value: "player_stat_over_under" },
		TEAM_STAT_OVER_UNDER: { value: "team_stat_over_under" },
		PLAYER_SEASON_STAT_OVER_UNDER: { value: "player_season_stat_over_under" },
		TEAM_SEASON_STAT_OVER_UNDER: { value: "team_season_stat_over_under" },
		GAME_TOTAL_OVER_UNDER: { value: "game_total_over_under" },
		PLAYER_STAT_NUMERIC_GUESS: { value: "player_stat_numeric_guess" },
		TEAM_STAT_NUMERIC_GUESS: { value: "team_stat_numeric_guess" },
		PLAYER_VS_PLAYER: { value: "player_vs_player" },
		PLAYER_VS_PLAYER_SEASON: { value: "player_vs_player_season" },
		YES_NO_PROP: { value: "yes_no_prop" },
		TEAM_VS_TEAM: { value: "team_vs_team" },
		TEAM_VS_TEAM_SEASON: { value: "team_vs_team_season" },
		PLAYER_SEASON_AWARD: { value: "player_season_award" },
		TEAM_SEASON_AWARD: { value: "team_season_award" },
		PLAYER_AWARD_FINALISTS: { value: "player_award_finalists" },
		TEAM_SEASON_STAT_NUMERIC_GUESS: { value: "team_season_stat_numeric_guess" },
		PLAYER_GAME_STAT_LEADER: { value: "player_game_stat_leader" },
		PLAYER_SEASON_STAT_LEADER: { value: "player_season_stat_leader" },
	},
})

// player_season_award/team_season_award only - see awardVerb on the
// questions table.
export const AwardVerb = builder.enumType("AwardVerb", {
	values: {
		WIN: { value: "win" },
		BE: { value: "be" },
	},
})

// player_season_stat_over_under/team_season_stat_over_under only - see
// statAggregation on the questions table.
export const StatAggregation = builder.enumType("StatAggregation", {
	values: {
		TOTAL: { value: "total" },
		PER_GAME: { value: "per_game" },
	},
})

export const QuestionStatus = builder.enumType("QuestionStatus", {
	values: {
		OPEN: { value: "open" },
		LOCKED: { value: "locked" },
		RESOLVED: { value: "resolved" },
		DISPUTED: { value: "disputed" },
	},
})

// Drives ordering for the questions feed. MOST_CALLED ranks by literal call
// count (see call_counts CTE in the questions resolver below) - not a
// stored column, so its pagination uses an offset cursor rather than the
// (createdAt, id) keyset NEW/CLOSING_SOON can use.
export const QuestionSortOrder = builder.enumType("QuestionSortOrder", {
	values: {
		MOST_CALLED: { value: "most_called" },
		NEW: { value: "new" },
		CLOSING_SOON: { value: "closing_soon" },
	},
})

// Admin Questions table's column sort - a distinct axis from the feed
// ordering above (which ranks by "what should a viewer see first", not by a
// literal column), so it gets its own enum rather than extending that one.
export const AdminQuestionSort = builder.enumType("AdminQuestionSort", {
	values: {
		TITLE: { value: "title" },
		SHAPE: { value: "shape" },
		ASKER: { value: "asker" },
		CALLERS: { value: "callers" },
		STATUS: { value: "status" },
	},
})

export const DisputeStatus = builder.enumType("DisputeStatus", {
	values: {
		OPEN: { value: "open" },
		UPHELD: { value: "upheld" },
		OVERTURNED: { value: "overturned" },
	},
})

export const ReportStatus = builder.enumType("ReportStatus", {
	values: {
		OPEN: { value: "open" },
		DISMISSED: { value: "dismissed" },
	},
})

// Defined up here (rather than beside VoidQuestionInput further down) so
// QuestionReportRef below can use it too - a report's reason is deliberately
// the same enum admin voids questions with, just surfaced under a caller-
// facing label set (see lib/report-defaults.ts on the frontend).
export const VoidReason = builder.enumType("VoidReason", {
	values: {
		NONSENSICAL: { value: "nonsensical" },
		OFF_TOPIC: { value: "off_topic" },
		UNSUPPORTED_SPORT: { value: "unsupported_sport" },
		DUPLICATE: { value: "duplicate" },
		OTHER: { value: "other" },
	},
})

// Not a DB column - derived from question.status (see myCalls below). A call
// is "resolved" once its question has resolved and scoring is final; open,
// locked, and disputed questions all still count as "open" from the caller's
// point of view since none of them are a final outcome yet.
export const CallResolutionStatus = builder.enumType("CallResolutionStatus", {
	values: {
		OPEN: { value: "open" },
		RESOLVED: { value: "resolved" },
	},
})

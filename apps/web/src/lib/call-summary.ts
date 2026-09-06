import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	isRateStat as computeIsRateStat,
	formatGuess as formatGuessValue,
} from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"

export type CallSummaryData = {
	guessValue: number | null
	conviction: number | null
	totalPoints: number | null
	question: {
		shape: QuestionShape
		ouLine: number | null
		numericActualValue: number | null
		numericToleranceAbsolute: number | null
		// The over/under shapes have no tolerance snapshot of their own, so
		// isRateStat below falls back to the picked stat's own tolerance tier
		// value instead - see isRateStat in #/lib/field-signal.
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
	}
	selections: {
		id: string
		conviction: number
		option: { label: string; isCorrect: boolean | null }
	}[]
}

function isRateStat(question: CallSummaryData["question"]): boolean {
	return computeIsRateStat(question)
}

// Every shape scores differently, so each needs its own formatting here - an
// over/under selection's label alone ("Over") loses the line the call was
// actually made against, and a player_season_award/team_season_award call
// reads better as a hit count than a wall of every pick once it's resolved.
export function pickSummary(call: CallSummaryData): string {
	return match(call.question.shape)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => formatOverUnder(call),
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () =>
			formatMultiSelect(call),
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => formatGuess(call),
		)
		.with(
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => formatSingleSelection(call),
		)
		.exhaustive()
}

function formatOverUnder(call: CallSummaryData): string {
	const selection = call.selections[0]
	if (!selection) return "-"
	return optionDisplayLabel(
		selection.option.label,
		isOverUnderQuestionShape(call.question.shape),
		call.question.ouLine,
		isRateStat(call.question),
	)
}

function formatMultiSelect(call: CallSummaryData): string {
	if (call.selections.length === 0) return "-"
	// isCorrect is set on every option at once, at resolution - so any one
	// selection having it set means the question resolved and all of them do.
	const resolved = call.selections[0].option.isCorrect !== null
	if (!resolved) return call.selections.map((s) => s.option.label).join(", ")
	const hits = call.selections.filter((s) => s.option.isCorrect).length
	return `${hits} of ${call.selections.length} hit`
}

function formatGuess(call: CallSummaryData): string {
	return call.guessValue !== null
		? formatGuessValue(call.guessValue, isRateStat(call.question))
		: "-"
}

function formatSingleSelection(call: CallSummaryData): string {
	const selection = call.selections[0]
	return selection ? selection.option.label : "-"
}

// Conviction lives in different places depending on shape: the numeric-guess
// shapes set it once on the call itself, single-pick shapes set it on their
// one selection. player_season_award/team_season_award are the one case with
// no single number - up to picksRequired picks, each with independent
// conviction - so that one is averaged and labeled "avg" rather than
// pretending it's one real value.
export function convictionSummary(call: CallSummaryData): string {
	return match(call.question.shape)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => (call.conviction !== null ? `${call.conviction}%` : "-"),
		)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => {
				const selection = call.selections[0]
				return selection ? `${selection.conviction}%` : "-"
			},
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () => {
			if (call.selections.length === 0) return "-"
			const avg =
				call.selections.reduce((sum, s) => sum + s.conviction, 0) /
				call.selections.length
			return `${Math.round(avg)}% avg`
		})
		.exhaustive()
}

// A numeric guess's own resultState comes purely from closeness scoring, not
// a right/wrong answer - so on a loss, showing the actual final value next to
// the conviction is what explains why it lost. A win's own points already
// tell that story, so this is loss-only, and numeric-guess-shape-only (every
// other shape's pick text already states what happened - "Over 47.5" either
// hit or it didn't).
export function lossContext(call: CallSummaryData): string | null {
	if (
		call.question.shape !== "PLAYER_STAT_NUMERIC_GUESS" &&
		call.question.shape !== "TEAM_STAT_NUMERIC_GUESS" &&
		call.question.shape !== "TEAM_SEASON_STAT_NUMERIC_GUESS"
	)
		return null
	if (resultState(call.totalPoints).status !== "loss") return null
	if (call.question.numericActualValue === null) return null
	return `actual was ${formatGuessValue(call.question.numericActualValue, isRateStat(call.question))}`
}

// The points sign is authoritative for win/loss across every shape, not a
// heuristic: selectionPoints (every option-based shape, and each
// player_season_award/team_season_award pick) is negative iff the pick was
// wrong, and numericGuessPoints is never negative at all - a numeric guess is
// scored purely by closeness to the field, so accuracy (hitTolerance) is a
// genuinely separate stat that can disagree with points and shouldn't drive
// this badge (see @called-my-shot/scoring).
export function resultState(
	totalPoints: number | null,
): { status: "pending" } | { status: "win" | "loss"; points: number } {
	if (totalPoints === null) return { status: "pending" }
	return { status: totalPoints >= 0 ? "win" : "loss", points: totalPoints }
}

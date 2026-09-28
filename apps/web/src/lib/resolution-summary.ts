import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	isRateStat as computeIsRateStat,
	formatGuess,
} from "#/lib/field-signal"
import {
	isOverUnderQuestionShape,
	optionDisplayLabel,
} from "#/lib/question-labels"

export type ResolvedAnswerData = {
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
	options: { id: string; label: string; isCorrect: boolean | null; actualValue: number | null }[]
}

function isRateStat(question: ResolvedAnswerData): boolean {
	return computeIsRateStat(question)
}

// The actual answer a question resolved to, independent of any one caller's
// pick - derived from the same isCorrect/numericActualValue/actualValue fields
// scoring itself runs on. Deliberately not sourced from resolutionNote: that's
// a free-text caption an admin writes and isn't guaranteed to restate the
// answer verbatim.
//
// Every branch states the number behind the answer when there is one, so a
// settled question reads as "Over 47.5, actual 63" rather than leaving the
// reader to go find what the player actually did. A question resolved by hand
// carries no number and reads exactly as it did before.
export function resolvedAnswerSummary(
	question: ResolvedAnswerData,
): string | null {
	return match(question.shape)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => formatOverUnder(question),
		)
		.with(
			"PLAYER_SEASON_AWARD",
			"TEAM_SEASON_AWARD",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_SEASON_STAT_LEADER",
			"PLAYER_TEAM_SEASON_STAT_LEADER",
			() => formatMultiSelect(question),
		)
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => formatNumeric(question),
		)
		.with(
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"TEAM_VS_TEAM_SEASON",
			"YES_NO_PROP",
			"PLAYER_AWARD_FINALISTS",
			() => formatSingleSelection(question),
		)
		.exhaustive()
}

function correctOptions(question: ResolvedAnswerData) {
	return question.options.filter((option) => option.isCorrect)
}

function formatOverUnder(question: ResolvedAnswerData): string | null {
	const winner = correctOptions(question)[0]
	if (!winner) return null
	const side = optionDisplayLabel(
		winner.label,
		isOverUnderQuestionShape(question.shape),
		question.ouLine,
		isRateStat(question),
	)
	return question.numericActualValue !== null
		? `${side}, actual ${formatGuess(question.numericActualValue, isRateStat(question))}`
		: side
}

function formatMultiSelect(question: ResolvedAnswerData): string | null {
	const winners = correctOptions(question)
	if (winners.length === 0) return null
	return winners
		.map((option) =>
			option.actualValue !== null
				? `${option.label}, ${formatGuess(option.actualValue, isRateStat(question))}`
				: option.label,
		)
		.join(" · ")
}

function formatNumeric(question: ResolvedAnswerData): string | null {
	return question.numericActualValue !== null
		? formatGuess(question.numericActualValue, isRateStat(question))
		: null
}

// The two sides of a head-to-head, winner first, so the answer carries the
// margin. Yes/No and the finalists shape share this branch and have no numbers
// on their options, so they fall back to the bare label.
function formatSingleSelection(question: ResolvedAnswerData): string | null {
	const winner = correctOptions(question)[0]
	if (!winner) return null
	const loser = question.options.find((option) => option.id !== winner.id)
	if (
		question.options.length !== 2 ||
		winner.actualValue === null ||
		loser?.actualValue == null
	) {
		return winner.label
	}
	const rate = isRateStat(question)
	return `${winner.label}, ${formatGuess(winner.actualValue, rate)} to ${formatGuess(loser.actualValue, rate)}`
}

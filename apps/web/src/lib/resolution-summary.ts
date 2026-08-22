import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"

export type ResolvedAnswerData = {
	shape: QuestionShape
	ouLine: number | null
	numericActualValue: number | null
	options: { label: string; isCorrect: boolean | null }[]
}

// The actual answer a question resolved to, independent of any one caller's
// pick - derived from the same isCorrect/numericActualValue fields scoring
// itself runs on. Deliberately not sourced from resolutionNote: that's a
// free-text caption an admin writes and isn't guaranteed to restate the
// answer verbatim.
export function resolvedAnswerSummary(
	question: ResolvedAnswerData,
): string | null {
	return match(question.shape)
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => formatOverUnder(question),
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () =>
			formatMultiSelect(question),
		)
		.with("PLAYER_STAT_NUMERIC_GUESS", "TEAM_STAT_NUMERIC_GUESS", () =>
			formatNumeric(question),
		)
		.with(
			"PLAYER_VS_PLAYER",
			"TEAM_VS_TEAM",
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
	return question.ouLine !== null
		? `${winner.label} ${question.ouLine}`
		: winner.label
}

function formatMultiSelect(question: ResolvedAnswerData): string | null {
	const winners = correctOptions(question)
	if (winners.length === 0) return null
	return winners.map((option) => option.label).join(", ")
}

function formatNumeric(question: ResolvedAnswerData): string | null {
	return question.numericActualValue !== null
		? String(question.numericActualValue)
		: null
}

function formatSingleSelection(question: ResolvedAnswerData): string | null {
	const winner = correctOptions(question)[0]
	return winner ? winner.label : null
}

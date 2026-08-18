import {
	FaArrowsUpDown,
	FaHashtag,
	FaListCheck,
	FaListUl,
	FaToggleOn,
} from "react-icons/fa6"
import type { IconType } from "react-icons/lib"
import type {
	QuestionCategory,
	QuestionType,
} from "#/graphql/generated/graphql"

export const questionCategoryLabel: Record<QuestionCategory, string> = {
	SEASON_AWARDS: "Season Awards",
	GAME_STATS: "Game Stats",
	PLAYER_STATS: "Player Stats",
	OTHER: "Other",
}

export const questionTypeLabel: Record<QuestionType, string> = {
	MULTIPLE_CHOICE: "Multiple Choice",
	YES_NO: "Yes/No",
	OVER_UNDER: "Over/Under",
	NUMERIC_GUESS: "Numeric Guess",
	MULTI_SELECT: "Multi-Select",
}

export const questionTypeIcon: Record<QuestionType, IconType> = {
	MULTIPLE_CHOICE: FaListUl,
	YES_NO: FaToggleOn,
	OVER_UNDER: FaArrowsUpDown,
	NUMERIC_GUESS: FaHashtag,
	MULTI_SELECT: FaListCheck,
}

// The over_under line is part of the option's identity, not shown anywhere
// else on its own - every place an option label renders (the live picker,
// the viewer's own pick, the field breakdown) needs the same "Over 47.5" /
// "Under 47.5" suffix, so it lives here once instead of as a repeated inline
// ternary at each call site.
export function optionDisplayLabel(
	label: string,
	type: QuestionType,
	ouLine: number | null,
): string {
	return type === "OVER_UNDER" && ouLine !== null ? `${label} ${ouLine}` : label
}

export const questionTypeDescription: Record<QuestionType, string> = {
	MULTIPLE_CHOICE:
		"Pick from a list — a champion, an award winner, anything with 2 or more named options.",
	YES_NO:
		"Will it happen or not — a triple-double, a buzzer-beater, anything with a clean yes or no.",
	OVER_UNDER:
		"One line, two sides — total points, a stat threshold, anything split by over and under.",
	NUMERIC_GUESS:
		"An exact number — rebounds, points, anything scored by closeness, not just right or wrong.",
	MULTI_SELECT:
		"Pick several — an All-league team, a playoff bracket, anything scored by how many of your picks land.",
}

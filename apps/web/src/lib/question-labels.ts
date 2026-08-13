import { FaArrowsUpDown, FaHashtag, FaListCheck, FaListUl, FaToggleOn } from "react-icons/fa6"
import type { IconType } from "react-icons/lib"
import type { QuestionCategory, QuestionType } from "#/graphql/generated/graphql"

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

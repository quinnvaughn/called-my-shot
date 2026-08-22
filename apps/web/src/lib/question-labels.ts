import {
	FaArrowsUpDown,
	FaHashtag,
	FaMedal,
	FaPeopleGroup,
	FaToggleOn,
	FaTrophy,
	FaUserGroup,
} from "react-icons/fa6"
import type { IconType } from "react-icons/lib"
import type { QuestionShape } from "#/graphql/generated/graphql"

const OVER_UNDER_SHAPES: readonly QuestionShape[] = [
	"PLAYER_STAT_OVER_UNDER",
	"TEAM_STAT_OVER_UNDER",
	"GAME_TOTAL_OVER_UNDER",
]

export const questionShapeLabel: Record<QuestionShape, string> = {
	PLAYER_STAT_OVER_UNDER: "Player Over/Under",
	TEAM_STAT_OVER_UNDER: "Team Over/Under",
	GAME_TOTAL_OVER_UNDER: "Game Total",
	PLAYER_STAT_NUMERIC_GUESS: "Player Numeric Guess",
	TEAM_STAT_NUMERIC_GUESS: "Team Numeric Guess",
	PLAYER_VS_PLAYER: "Player vs Player",
	TEAM_VS_TEAM: "Team vs Team",
	YES_NO_PROP: "Yes/No",
	PLAYER_SEASON_AWARD: "Player Season Award",
	TEAM_SEASON_AWARD: "Team Season Award",
	PLAYER_AWARD_FINALISTS: "Award Finalists",
}

export const questionShapeIcon: Record<QuestionShape, IconType> = {
	PLAYER_STAT_OVER_UNDER: FaArrowsUpDown,
	TEAM_STAT_OVER_UNDER: FaArrowsUpDown,
	GAME_TOTAL_OVER_UNDER: FaArrowsUpDown,
	PLAYER_STAT_NUMERIC_GUESS: FaHashtag,
	TEAM_STAT_NUMERIC_GUESS: FaHashtag,
	PLAYER_VS_PLAYER: FaUserGroup,
	TEAM_VS_TEAM: FaPeopleGroup,
	YES_NO_PROP: FaToggleOn,
	PLAYER_SEASON_AWARD: FaTrophy,
	TEAM_SEASON_AWARD: FaTrophy,
	PLAYER_AWARD_FINALISTS: FaMedal,
}

// The *_over_under shapes' line is part of the option's identity, not shown
// anywhere else on its own - every place an option label renders (the live
// picker, the viewer's own pick, the field breakdown) needs the same
// "Over 47.5" / "Under 47.5" suffix, so it lives here once instead of as a
// repeated inline ternary at each call site.
export function optionDisplayLabel(
	label: string,
	shape: QuestionShape,
	ouLine: number | null,
): string {
	return OVER_UNDER_SHAPES.includes(shape) && ouLine !== null
		? `${label} ${ouLine}`
		: label
}

// The share card's small category badge groups shapes more coarsely than
// questionShapeLabel above (a share card is a tiny image, not a picker card)
// - mirrors apps/api/src/routes/share.ts's own SHAPE_LABEL constant exactly,
// same "hand-synced across the two codebases" reasoning as quipForCall being
// shared through @called-my-shot/scoring instead: both need to produce
// identical text, this one just isn't shareable code across the API/web
// boundary the way a pure function is.
export const shareCardShapeLabel: Record<QuestionShape, string> = {
	PLAYER_STAT_OVER_UNDER: "Player Prop",
	TEAM_STAT_OVER_UNDER: "Team Prop",
	GAME_TOTAL_OVER_UNDER: "Game Total",
	PLAYER_STAT_NUMERIC_GUESS: "Player Prop",
	TEAM_STAT_NUMERIC_GUESS: "Team Prop",
	PLAYER_VS_PLAYER: "Head-to-Head",
	TEAM_VS_TEAM: "Game Outcome",
	YES_NO_PROP: "Yes/No",
	PLAYER_SEASON_AWARD: "Season Award",
	TEAM_SEASON_AWARD: "Season Award",
	PLAYER_AWARD_FINALISTS: "Season Award",
}

// LOCKED sub-line on QuestionCard - resolution is always a human manually
// entering the answer (there's no automated score feed a question resolves
// itself off of), so this is one generic line rather than a per-shape guess
// at what's being waited on.
export const AWAITING_RESULT_TEXT = "awaiting resolution"

export const questionShapeDescription: Record<QuestionShape, string> = {
	PLAYER_STAT_OVER_UNDER:
		"One player, one stat, one line: will they go over or under it.",
	TEAM_STAT_OVER_UNDER:
		"One team, one stat, one line: will they go over or under it.",
	GAME_TOTAL_OVER_UNDER:
		"A game-wide total: combined points, anything split by over and under with no single player or team attached.",
	PLAYER_STAT_NUMERIC_GUESS:
		"An exact number for one player: rebounds, points, anything scored by closeness, not just right or wrong.",
	TEAM_STAT_NUMERIC_GUESS:
		"An exact number for one team: anything scored by closeness, not just right or wrong.",
	PLAYER_VS_PLAYER: "Two named players, one stat: who comes out ahead.",
	TEAM_VS_TEAM: "A real matchup: who wins.",
	YES_NO_PROP:
		"Will it happen or not: a triple-double, a buzzer-beater, anything with a clean yes or no.",
	PLAYER_SEASON_AWARD:
		"A league-wide player award: MVP, Rookie of the Year, anything decided at season's end.",
	TEAM_SEASON_AWARD:
		"A league-wide team award: a championship, a division title, anything decided at season's end.",
	PLAYER_AWARD_FINALISTS:
		"The real announced finalists for an award: pick the winner from the actual shortlist.",
}

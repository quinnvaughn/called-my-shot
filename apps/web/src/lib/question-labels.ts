import {
	FaArrowsUpDown,
	FaHashtag,
	FaMedal,
	FaPeopleGroup,
	FaRankingStar,
	FaToggleOn,
	FaTrophy,
	FaUserGroup,
} from "react-icons/fa6"
import type { IconType } from "react-icons/lib"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { formatGuess } from "#/lib/field-signal"

const OVER_UNDER_SHAPES: readonly QuestionShape[] = [
	"PLAYER_STAT_OVER_UNDER",
	"TEAM_STAT_OVER_UNDER",
	"PLAYER_SEASON_STAT_OVER_UNDER",
	"TEAM_SEASON_STAT_OVER_UNDER",
	"GAME_TOTAL_OVER_UNDER",
]

// _STAT_OVER_UNDER now always names the scope explicitly (Game vs Season) -
// these two used to be one ambiguous shape with an optional game, which
// wasn't obvious from the picker and read as "leave it blank for season
// long" only once you were already deep in the form.
export const questionShapeLabel: Record<QuestionShape, string> = {
	PLAYER_STAT_OVER_UNDER: "Player Game Over/Under",
	TEAM_STAT_OVER_UNDER: "Team Game Over/Under",
	PLAYER_SEASON_STAT_OVER_UNDER: "Player Season Over/Under",
	TEAM_SEASON_STAT_OVER_UNDER: "Team Season Over/Under",
	GAME_TOTAL_OVER_UNDER: "Game Total",
	PLAYER_STAT_NUMERIC_GUESS: "Player Game Numeric Guess",
	TEAM_STAT_NUMERIC_GUESS: "Team Game Numeric Guess",
	TEAM_SEASON_STAT_NUMERIC_GUESS: "Team Season Numeric Guess",
	PLAYER_VS_PLAYER: "Player Game Head-to-Head",
	PLAYER_VS_PLAYER_SEASON: "Player Season Head-to-Head",
	TEAM_VS_TEAM: "Team vs Team",
	TEAM_VS_TEAM_SEASON: "Team Season Head-to-Head",
	PLAYER_GAME_STAT_LEADER: "Game Stat Leader",
	PLAYER_SEASON_STAT_LEADER: "Player Season Multi-Way",
	YES_NO_PROP: "Yes/No",
	PLAYER_SEASON_AWARD: "Player Season Award",
	TEAM_SEASON_AWARD: "Team Season Award",
	PLAYER_AWARD_FINALISTS: "Award Finalists",
}

export const questionShapeIcon: Record<QuestionShape, IconType> = {
	PLAYER_STAT_OVER_UNDER: FaArrowsUpDown,
	TEAM_STAT_OVER_UNDER: FaArrowsUpDown,
	PLAYER_SEASON_STAT_OVER_UNDER: FaArrowsUpDown,
	TEAM_SEASON_STAT_OVER_UNDER: FaArrowsUpDown,
	GAME_TOTAL_OVER_UNDER: FaArrowsUpDown,
	PLAYER_STAT_NUMERIC_GUESS: FaHashtag,
	TEAM_STAT_NUMERIC_GUESS: FaHashtag,
	TEAM_SEASON_STAT_NUMERIC_GUESS: FaHashtag,
	PLAYER_VS_PLAYER: FaUserGroup,
	PLAYER_VS_PLAYER_SEASON: FaUserGroup,
	TEAM_VS_TEAM: FaPeopleGroup,
	TEAM_VS_TEAM_SEASON: FaPeopleGroup,
	PLAYER_GAME_STAT_LEADER: FaRankingStar,
	PLAYER_SEASON_STAT_LEADER: FaRankingStar,
	YES_NO_PROP: FaToggleOn,
	PLAYER_SEASON_AWARD: FaTrophy,
	TEAM_SEASON_AWARD: FaTrophy,
	PLAYER_AWARD_FINALISTS: FaMedal,
}

export function isOverUnderQuestionShape(shape: QuestionShape): boolean {
	return OVER_UNDER_SHAPES.includes(shape)
}

// The *_over_under shapes' line is part of the option's identity, not shown
// anywhere else on its own - every place an option label renders (the live
// picker, the viewer's own pick, the field breakdown) needs the same
// "Over 47.5" / "Under 47.5" suffix, so it lives here once instead of as a
// repeated inline ternary at each call site. Takes the already-resolved
// "is this an over/under shape" boolean rather than a shape value directly,
// since callers in the cast-call-form world use a different (lowercase)
// shape type than the raw GraphQL QuestionShape enum used elsewhere - see
// isOverUnderQuestionShape above and isOverUnderShape in
// cast-call-form/use-cast-call-form.ts, the two ways of producing it.
export function optionDisplayLabel(
	label: string,
	isOverUnder: boolean,
	ouLine: number | null,
	// True only when the question's stat is a rate stat (batting average,
	// ERA) - pads ouLine to a fixed 3 decimals instead of a bare number
	// silently dropping a meaningful trailing zero (".300" reading as ".3").
	// See formatGuess in #/lib/field-signal.
	isRateStat = false,
): string {
	return isOverUnder && ouLine !== null
		? `${label} ${formatGuess(ouLine, isRateStat)}`
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
	PLAYER_SEASON_STAT_OVER_UNDER: "Season Prop",
	TEAM_SEASON_STAT_OVER_UNDER: "Season Prop",
	GAME_TOTAL_OVER_UNDER: "Game Total",
	PLAYER_STAT_NUMERIC_GUESS: "Player Prop",
	TEAM_STAT_NUMERIC_GUESS: "Team Prop",
	TEAM_SEASON_STAT_NUMERIC_GUESS: "Season Prop",
	PLAYER_VS_PLAYER: "Head-to-Head",
	PLAYER_VS_PLAYER_SEASON: "Head-to-Head",
	TEAM_VS_TEAM: "Game Outcome",
	TEAM_VS_TEAM_SEASON: "Head-to-Head",
	PLAYER_GAME_STAT_LEADER: "Stat Leader",
	// Not "Stat Leader" like the game-scoped shape above, which really is a
	// leaderboard over both full rosters. This one ranks a creator-named
	// handful, and a badge reading "Stat Leader" on a share card - where
	// there's no picker description to correct it - invites the league-wide
	// reading the shape's title works to rule out.
	PLAYER_SEASON_STAT_LEADER: "Multi-Way",
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
		"One player, one stat, one game: will they go over or under the line.",
	TEAM_STAT_OVER_UNDER:
		"One team, one stat, one game: will they go over or under the line.",
	PLAYER_SEASON_STAT_OVER_UNDER:
		"One player, one stat, the whole season: will they finish over or under the line.",
	TEAM_SEASON_STAT_OVER_UNDER:
		"One team, one stat, the whole season: will they finish over or under the line.",
	GAME_TOTAL_OVER_UNDER:
		"A game-wide total: combined points, anything split by over and under with no single player or team attached.",
	PLAYER_STAT_NUMERIC_GUESS:
		"An exact number for one player, one game: rebounds, points, anything scored by closeness, not just right or wrong.",
	TEAM_STAT_NUMERIC_GUESS:
		"An exact number for one team, one game: anything scored by closeness, not just right or wrong.",
	TEAM_SEASON_STAT_NUMERIC_GUESS:
		"An exact number for one team, the whole season: a win total, anything scored by closeness, not just right or wrong.",
	PLAYER_VS_PLAYER:
		"Two named players, one stat, same game: who comes out ahead. Teammates or opponents, either works.",
	PLAYER_VS_PLAYER_SEASON:
		"Two named players, one stat, the whole season: who comes out ahead.",
	TEAM_VS_TEAM: "A real matchup: who will win.",
	TEAM_VS_TEAM_SEASON:
		"Two teams, one stat, the whole season: who finishes ahead. More wins, more points, either way.",
	PLAYER_GAME_STAT_LEADER:
		"One stat, one game, both rosters: who leads it. Resolution can mark more than one player correct on a real tie.",
	PLAYER_SEASON_STAT_LEADER:
		"Three or more named players, one stat, the whole season: which of them finishes on top - always one of the names you pick, not the league leader. Off-catalog stats allowed, so advanced metrics work.",
	YES_NO_PROP:
		"Will it happen or not: a triple-double, a buzzer-beater, anything with a clean yes or no.",
	PLAYER_SEASON_AWARD:
		"A league-wide player award: MVP, Rookie of the Year, anything decided at season's end.",
	TEAM_SEASON_AWARD:
		"A league-wide team award: a championship, a division title, anything decided at season's end.",
	PLAYER_AWARD_FINALISTS:
		"The real announced finalists for an award: pick the winner from the actual shortlist.",
}

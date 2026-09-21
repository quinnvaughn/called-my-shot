import {
	SHAPE_FAMILY_BY_SHAPE,
	SHAPE_LABEL,
	SHARE_CARD_SHAPE_LABEL,
	type ShapeFamily,
} from "@called-my-shot/scoring"
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

// The strings live in @called-my-shot/scoring, keyed by the DB's snake_case
// shape names, because the API needs them too - it renders share-card PNGs
// with satori, where there's no client to do the labelling. Derived here into
// the GraphQL enum's SCREAMING_CASE, same as questionShapeFamily below.
export const questionShapeLabel = Object.fromEntries(
	Object.entries(SHAPE_LABEL).map(([shape, label]) => [
		shape.toUpperCase(),
		label,
	]),
) as Record<QuestionShape, string>

// The six buckets the shape filter groups its 18 options under - a flat list of
// 18 is unscannable in a dropdown, and these are the lines people already think
// along ("my over/unders", "my award calls"). The API groups a report card's
// breakdown by the same six, so the assignment itself lives in
// @called-my-shot/scoring and both sides read it from there.
export {
	SHAPE_FAMILIES,
	SHAPE_FAMILY_LABEL as shapeFamilyLabel,
	type ShapeFamily,
} from "@called-my-shot/scoring"

// The shared map is keyed by the DB's snake_case shape names; this one is
// keyed by the GraphQL enum's SCREAMING_CASE. Derived rather than restated so
// the two can't disagree about which family a shape belongs to - the
// exhaustive Record that forces a newly added shape to be filed somewhere
// deliberately still exists, it just lives on SHAPE_FAMILY_BY_SHAPE now.
// Family values are identical on both sides, so only the key is converted.
export const questionShapeFamily = Object.fromEntries(
	Object.entries(SHAPE_FAMILY_BY_SHAPE).map(([shape, family]) => [
		shape.toUpperCase(),
		family,
	]),
) as Record<QuestionShape, ShapeFamily>

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

// The shapes scored off calls.guessValue with no questionOptions row at all
// (mirrors castCallSchema's numeric-guess bucket in packages/schemas/src/
// questions.ts). Anywhere a call renders has to branch on this: a numeric
// guess shows one typed number where every other shape shows a picked
// option.
//
// A Record, not the readonly array OVER_UNDER_SHAPES uses above or the
// boolean || chain this check invites at a call site: both treat an omitted
// shape as false, which here silently renders a numeric call as though it
// had options. Every shape has to be answered, so a newly added one fails
// the build rather than picking a default.
const NUMERIC_GUESS_BY_SHAPE: Record<QuestionShape, boolean> = {
	PLAYER_STAT_OVER_UNDER: false,
	TEAM_STAT_OVER_UNDER: false,
	PLAYER_SEASON_STAT_OVER_UNDER: false,
	TEAM_SEASON_STAT_OVER_UNDER: false,
	GAME_TOTAL_OVER_UNDER: false,
	PLAYER_STAT_NUMERIC_GUESS: true,
	TEAM_STAT_NUMERIC_GUESS: true,
	TEAM_SEASON_STAT_NUMERIC_GUESS: true,
	PLAYER_VS_PLAYER: false,
	PLAYER_VS_PLAYER_SEASON: false,
	TEAM_VS_TEAM: false,
	TEAM_VS_TEAM_SEASON: false,
	PLAYER_GAME_STAT_LEADER: false,
	PLAYER_SEASON_STAT_LEADER: false,
	YES_NO_PROP: false,
	PLAYER_SEASON_AWARD: false,
	TEAM_SEASON_AWARD: false,
	PLAYER_AWARD_FINALISTS: false,
}

export function isNumericQuestionShape(shape: QuestionShape): boolean {
	return NUMERIC_GUESS_BY_SHAPE[shape]
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

// The share card's small category badge, which groups shapes more coarsely
// than questionShapeLabel above - a share card is a tiny image, not a picker
// card. The strings and the reasoning behind the coarser grouping live on
// SHARE_CARD_SHAPE_LABEL in @called-my-shot/scoring, because the API renders
// the same badge into a PNG and into the resolution digest email. Derived
// into the GraphQL enum's casing, same as the two maps above.
export const shareCardShapeLabel = Object.fromEntries(
	Object.entries(SHARE_CARD_SHAPE_LABEL).map(([shape, label]) => [
		shape.toUpperCase(),
		label,
	]),
) as Record<QuestionShape, string>

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

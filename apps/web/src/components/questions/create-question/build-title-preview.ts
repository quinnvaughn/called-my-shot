import { generateQuestionTitle } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import { formatGuess } from "#/lib/field-signal"
import type { CreateQuestionValues } from "./form-context"

// Only the three fields the titles actually name. Structural rather than the
// generated GameByIdQuery type so this stays a plain function over plain data -
// nothing here should need a GraphQL document to call or to test.
type TitleGame = {
	startsAt: string
	homeTeam: { name: string }
	awayTeam: { name: string }
}

export type TitlePreviewInput = {
	shape: CreateQuestionValues["shape"]
	options: CreateQuestionValues["options"]
	statAggregation: CreateQuestionValues["statAggregation"]
	awardVerb: CreateQuestionValues["awardVerb"]
	awardConferences: CreateQuestionValues["awardConferences"]
	awardDivisions: CreateQuestionValues["awardDivisions"]
	awardName: string
	eventClause: string
	picksRequired: number | undefined
	ouLine: number | undefined
	selectedGame: TitleGame | null
	selectedPlayerName: string | undefined
	selectedTeamName: string | undefined
	subjectName: string | null
	opponentTeamName: string | undefined
	statName: string
	isRateStat: boolean
	// Whether the stat came from the league's catalog rather than being typed in
	// freeform - the season stat leader title below phrases an off-catalog metric
	// differently, since nothing can classify one as counting or rate.
	hasCatalogStat: boolean
	offersStatAggregation: boolean
}

/**
 * Mirrors generateQuestionTitle's own server-side call (see createQuestion in
 * apps/api's resolver) against whatever's filled in so far - null once any
 * piece it needs is still missing, rather than a half-built string.
 */
export function buildTitlePreview(input: TitlePreviewInput): string | null {
	const {
		shape,
		options,
		statAggregation,
		awardVerb,
		awardConferences,
		awardDivisions,
		awardName,
		eventClause,
		picksRequired,
		ouLine,
		selectedGame,
		selectedPlayerName,
		selectedTeamName,
		subjectName,
		opponentTeamName,
		statName,
		isRateStat,
		hasCatalogStat,
		offersStatAggregation,
	} = input

	return match(shape)
		.with("player_stat_over_under", (s) =>
			selectedPlayerName && statName && ouLine !== undefined && opponentTeamName
				? generateQuestionTitle({
						shape: s,
						playerName: selectedPlayerName,
						statName,
						ouLine: formatGuess(ouLine, isRateStat),
						opponentTeamName,
						gameDate: selectedGame?.startsAt,
					})
				: null,
		)
		.with("team_stat_over_under", (s) =>
			selectedTeamName && statName && ouLine !== undefined && opponentTeamName
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
						ouLine: formatGuess(ouLine, isRateStat),
						opponentTeamName,
						gameDate: selectedGame?.startsAt,
					})
				: null,
		)
		.with("player_season_stat_over_under", (s) =>
			selectedPlayerName && statName && ouLine !== undefined && statAggregation
				? generateQuestionTitle({
						shape: s,
						playerName: selectedPlayerName,
						statName,
						ouLine: formatGuess(ouLine, isRateStat),
						statAggregation,
					})
				: null,
		)
		.with("team_season_stat_over_under", (s) =>
			selectedTeamName && statName && ouLine !== undefined && statAggregation
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
						ouLine: formatGuess(ouLine, isRateStat),
						statAggregation,
					})
				: null,
		)
		.with("game_total_over_under", (s) =>
			selectedGame && statName && ouLine !== undefined
				? generateQuestionTitle({
						shape: s,
						awayTeamName: selectedGame.awayTeam.name,
						homeTeamName: selectedGame.homeTeam.name,
						statName,
						ouLine: formatGuess(ouLine, isRateStat),
						gameDate: selectedGame.startsAt,
					})
				: null,
		)
		.with("player_stat_numeric_guess", (s) =>
			selectedPlayerName && statName && opponentTeamName
				? generateQuestionTitle({
						shape: s,
						playerName: selectedPlayerName,
						statName,
						opponentTeamName,
						gameDate: selectedGame?.startsAt,
					})
				: null,
		)
		.with("team_stat_numeric_guess", (s) =>
			selectedTeamName && statName && opponentTeamName
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
						opponentTeamName,
						gameDate: selectedGame?.startsAt,
					})
				: null,
		)
		.with("team_season_stat_numeric_guess", (s) =>
			selectedTeamName && statName
				? generateQuestionTitle({
						shape: s,
						teamName: selectedTeamName,
						statName,
						// Preview-only approximation - this form has no season-year
						// fetch of its own (nothing else here needs one), and the
						// generated text is a prefill the creator can still edit, same
						// as every other shape's title here.
						year: new Date().getFullYear(),
					})
				: null,
		)
		.with("player_vs_player", (s) => {
			const [a, b] = options
			return a?.label && b?.label && statName
				? generateQuestionTitle({
						shape: s,
						playerAName: a.label,
						playerBName: b.label,
						statName,
						isRateStat,
						gameDate: selectedGame?.startsAt,
					})
				: null
		})
		.with("player_vs_player_season", (s) => {
			const [a, b] = options
			return a?.label && b?.label && statName && statAggregation
				? generateQuestionTitle({
						shape: s,
						playerAName: a.label,
						playerBName: b.label,
						statName,
						statAggregation,
						isRateStat,
					})
				: null
		})
		.with("team_vs_team", (s) =>
			selectedGame
				? generateQuestionTitle({
						shape: s,
						awayTeamName: selectedGame.awayTeam.name,
						homeTeamName: selectedGame.homeTeam.name,
						gameDate: selectedGame.startsAt,
					})
				: null,
		)
		.with("team_vs_team_season", (s) => {
			const [a, b] = options
			return a?.label && b?.label && statName && statAggregation
				? generateQuestionTitle({
						shape: s,
						teamAName: a.label,
						teamBName: b.label,
						statName,
						statAggregation,
						isRateStat,
					})
				: null
		})
		.with("player_game_stat_leader", (s) =>
			selectedGame && statName
				? generateQuestionTitle({
						shape: s,
						awayTeamName: selectedGame.awayTeam.name,
						homeTeamName: selectedGame.homeTeam.name,
						statName,
						gameDate: selectedGame.startsAt,
					})
				: null,
		)
		.with("player_season_stat_leader", (s) => {
			const names = options
				.map((option) => option.label)
				.filter((label) => label.trim().length > 0)
			return names.length >= 3 && statName
				? generateQuestionTitle({
						shape: s,
						playerNames: names,
						statName,
						// A freeform stat counts as a rate here even though
						// isRateStat can't know that it is one. "The most RAPM" is
						// broken English where "the highest RAPM" is not, and "the
						// highest points" still reads fine if the creator typed a
						// counting stat by hand - so the rate wording is the safe
						// default for anything off-catalog.
						isRateStat: isRateStat || !hasCatalogStat,
						statAggregation: offersStatAggregation
							? (statAggregation ?? null)
							: null,
					})
				: null
		})
		.with("yes_no_prop", (s) =>
			eventClause.trim()
				? generateQuestionTitle({
						shape: s,
						subjectName,
						eventClause,
						gameDate: selectedGame?.startsAt,
					})
				: null,
		)
		.with("player_season_award", "team_season_award", (s) =>
			awardName.trim() && picksRequired && awardVerb
				? generateQuestionTitle({
						shape: s,
						awardName,
						verb: awardVerb,
						picksRequired,
						awardConferences,
						awardDivisions,
					})
				: null,
		)
		.with("player_award_finalists", (s) =>
			awardName.trim() && options.length >= 2
				? generateQuestionTitle({
						shape: s,
						awardName,
						finalistNames: options.map((option) => option.label),
					})
				: null,
		)
		.exhaustive()
}

import { generateQuestionTitle } from "@called-my-shot/schemas"
import { match } from "ts-pattern"
import type { Question, QuestionOption } from "../../db/schema"
import { parseGenerationKey } from "./generation-key"

export type GameForTitle = {
	homeTeam: { id: string; name: string }
	awayTeam: { id: string; name: string }
	// Set on a postseason series game, whose who-wins question names the game
	// so it can't be read as asking about the series.
	seriesGameNumber?: number | null
}

// What a generated question's title is built from, beyond the game itself.
// Kept separate from the game so a sync pass can rebuild every title on a
// game from what the questions already store (see titleFactsFor).
export type GameQuestionTitleFacts =
	| { shape: "team_vs_team" }
	| { shape: "team_stat_numeric_guess"; statName: string; teamId: string }
	| {
			shape: "team_stat_over_under"
			statName: string
			teamId: string
			ouLine: number
	  }
	| {
			shape: "player_vs_player"
			statName: string
			// Away player first, same order as the question's options.
			playerNames: [string, string]
	  }
	| {
			shape: "player_stat_over_under"
			statName: string
			playerName: string
			ouLine: number
	  }
	| { shape: "player_game_stat_leader"; statName: string }

export function gameQuestionTitle(
	facts: GameQuestionTitleFacts,
	game: GameForTitle,
): string {
	const teamName = (teamId: string) =>
		teamId === game.homeTeam.id ? game.homeTeam.name : game.awayTeam.name

	return (
		match(facts)
			.with({ shape: "team_vs_team" }, () =>
				game.seriesGameNumber
					? `Who will win Game ${game.seriesGameNumber}?`
					: generateQuestionTitle({ shape: "team_vs_team" }),
			)
			.with({ shape: "team_stat_numeric_guess" }, (f) =>
				generateQuestionTitle({
					shape: "team_stat_numeric_guess",
					teamName: teamName(f.teamId),
					statName: f.statName,
				}),
			)
			.with({ shape: "team_stat_over_under" }, (f) =>
				generateQuestionTitle({
					shape: "team_stat_over_under",
					teamName: teamName(f.teamId),
					statName: f.statName,
					ouLine: String(f.ouLine),
				}),
			)
			// Every generated head-to-head is on a counting stat.
			.with({ shape: "player_vs_player" }, (f) =>
				generateQuestionTitle({
					shape: "player_vs_player",
					playerAName: f.playerNames[0],
					playerBName: f.playerNames[1],
					statName: f.statName,
					isRateStat: false,
				}),
			)
			.with({ shape: "player_stat_over_under" }, (f) =>
				generateQuestionTitle({
					shape: "player_stat_over_under",
					playerName: f.playerName,
					statName: f.statName,
					ouLine: String(f.ouLine),
				}),
			)
			.with({ shape: "player_game_stat_leader" }, (f) =>
				generateQuestionTitle({
					shape: "player_game_stat_leader",
					statName: f.statName,
				}),
			)
			.exhaustive()
	)
}

export type TitledQuestion = Question & {
	stat: { name: string } | null
	subjectPlayer: { name: string } | null
	options: Pick<QuestionOption, "label" | "sortOrder">[]
}

// The facts a generated question was titled from, read back off the row.
// Null for anything that isn't a generated game question, or one missing a
// piece its title needs - that title is left as it is.
export function titleFactsFor(
	question: TitledQuestion,
): GameQuestionTitleFacts | null {
	if (!question.generationKey || !parseGenerationKey(question.generationKey)) {
		return null
	}
	const statName = question.stat?.name

	return match(question.shape)
		.returnType<GameQuestionTitleFacts | null>()
		.with("team_vs_team", () => ({ shape: "team_vs_team" }))
		.with("team_stat_numeric_guess", () =>
			statName && question.subjectTeamId
				? {
						shape: "team_stat_numeric_guess",
						statName,
						teamId: question.subjectTeamId,
					}
				: null,
		)
		.with("player_vs_player", () => {
			const [a, b] = [...question.options].sort(
				(x, y) => x.sortOrder - y.sortOrder,
			)
			return statName && a && b
				? {
						shape: "player_vs_player",
						statName,
						playerNames: [a.label, b.label],
					}
				: null
		})
		.with("player_stat_over_under", () =>
			statName && question.subjectPlayer && question.ouLine !== null
				? {
						shape: "player_stat_over_under",
						statName,
						playerName: question.subjectPlayer.name,
						ouLine: question.ouLine,
					}
				: null,
		)
		.with("team_stat_over_under", () =>
			statName && question.subjectTeamId && question.ouLine !== null
				? {
						shape: "team_stat_over_under",
						statName,
						teamId: question.subjectTeamId,
						ouLine: question.ouLine,
					}
				: null,
		)
		.with("player_game_stat_leader", () =>
			statName ? { shape: "player_game_stat_leader", statName } : null,
		)
		.with(
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"game_total_over_under",
			"player_stat_numeric_guess",
			"player_vs_player_season",
			"team_vs_team_season",
			"yes_no_prop",
			"player_season_award",
			"team_season_award",
			"player_award_finalists",
			"team_season_stat_numeric_guess",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			() => null,
		)
		.exhaustive()
}

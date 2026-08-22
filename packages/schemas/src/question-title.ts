import { match } from "ts-pattern"

export type TitleInput =
	| {
			shape: "player_stat_over_under"
			playerName: string
			statName: string
			ouLine: number
	  }
	| {
			shape: "team_stat_over_under"
			teamName: string
			statName: string
			ouLine: number
	  }
	| {
			shape: "game_total_over_under"
			awayTeamName: string
			homeTeamName: string
			statName: string
			ouLine: number
	  }
	| { shape: "player_stat_numeric_guess"; playerName: string; statName: string }
	| { shape: "team_stat_numeric_guess"; teamName: string; statName: string }
	| {
			shape: "player_vs_player"
			playerAName: string
			playerBName: string
			statName: string
	  }
	| { shape: "team_vs_team"; awayTeamName: string; homeTeamName: string }
	| { shape: "yes_no_prop"; subjectName: string | null; eventClause: string }
	| { shape: "player_season_award"; awardName: string; picksRequired: number }
	| { shape: "team_season_award"; awardName: string; picksRequired: number }
	| {
			shape: "player_award_finalists"
			awardName: string
			finalistNames: string[]
	  }

// The one place a question's title is decided - generated from the shape's
// own validated structured fields at creation time (see createQuestion in
// graphql/types/question.ts) rather than trusted from creator-typed text, so
// every question's title is consistent in format/voice and there's nothing
// here to moderate.
export function generateQuestionTitle(input: TitleInput): string {
	return match(input)
		.with(
			{ shape: "player_stat_over_under" },
			({ playerName, statName, ouLine }) =>
				`${playerName} — over/under ${ouLine} ${statName}`,
		)
		.with(
			{ shape: "team_stat_over_under" },
			({ teamName, statName, ouLine }) =>
				`${teamName} — over/under ${ouLine} ${statName}`,
		)
		.with(
			{ shape: "game_total_over_under" },
			({ awayTeamName, homeTeamName, statName, ouLine }) =>
				`${awayTeamName} @ ${homeTeamName} — over/under ${ouLine} ${statName}`,
		)
		.with(
			{ shape: "player_stat_numeric_guess" },
			({ playerName, statName }) => `Guess ${playerName}'s ${statName}`,
		)
		.with(
			{ shape: "team_stat_numeric_guess" },
			({ teamName, statName }) => `Guess ${teamName}'s ${statName}`,
		)
		.with(
			{ shape: "player_vs_player" },
			({ playerAName, playerBName, statName }) =>
				`${statName}: ${playerAName} vs ${playerBName}`,
		)
		.with(
			{ shape: "team_vs_team" },
			({ awayTeamName, homeTeamName }) =>
				`${awayTeamName} @ ${homeTeamName} — who wins?`,
		)
		.with({ shape: "yes_no_prop" }, ({ subjectName, eventClause }) =>
			subjectName
				? `Will ${subjectName} ${eventClause}?`
				: `Will ${eventClause}?`,
		)
		.with({ shape: "player_season_award" }, ({ awardName, picksRequired }) =>
			picksRequired > 1
				? `Pick the ${awardName} (${picksRequired})`
				: `Who wins ${awardName}?`,
		)
		.with({ shape: "team_season_award" }, ({ awardName, picksRequired }) =>
			picksRequired > 1
				? `Pick the ${awardName} (${picksRequired})`
				: `Who wins ${awardName}?`,
		)
		.with(
			{ shape: "player_award_finalists" },
			({ awardName, finalistNames }) =>
				`Who wins ${awardName}: ${finalistNames.join(", ")}?`,
		)
		.exhaustive()
}

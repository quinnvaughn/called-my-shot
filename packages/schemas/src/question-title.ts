import { match } from "ts-pattern"
import type { StatAggregation } from "./questions"

// gameDate is optional on every shape (even the three award ones, where it's
// never actually set) rather than a separate per-shape concern - whether a
// question has a real-world game attached is an instance-level fact (gameId
// on the questions table), not something fixed by shape the way statName or
// ouLine are. Set from the picked game's own startsAt (ISO string, same
// reasoning as locksAt elsewhere in this package - stays a plain string end
// to end, parsed only where actually needed).
type WithGameDate = { gameDate?: string }

export type TitleInput = WithGameDate &
	(
		| {
				shape: "player_stat_over_under"
				playerName: string
				statName: string
				ouLine: number
				opponentTeamName: string
		  }
		| {
				shape: "team_stat_over_under"
				teamName: string
				statName: string
				ouLine: number
				opponentTeamName: string
		  }
		| {
				shape: "player_season_stat_over_under"
				playerName: string
				statName: string
				ouLine: number
				statAggregation: StatAggregation
		  }
		| {
				shape: "team_season_stat_over_under"
				teamName: string
				statName: string
				ouLine: number
				statAggregation: StatAggregation
		  }
		| {
				shape: "game_total_over_under"
				awayTeamName: string
				homeTeamName: string
				statName: string
				ouLine: number
		  }
		| {
				shape: "player_stat_numeric_guess"
				playerName: string
				statName: string
				opponentTeamName: string
		  }
		| {
				shape: "team_stat_numeric_guess"
				teamName: string
				statName: string
				opponentTeamName: string
		  }
		| {
				shape: "player_vs_player"
				playerAName: string
				playerBName: string
				statName: string
		  }
		| {
				shape: "player_vs_player_season"
				playerAName: string
				playerBName: string
				statName: string
				statAggregation: StatAggregation
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
	)

// Short, no year - this is a scannability aid ("when's this happening"), not
// a full timestamp; the game itself (with its real date/time) is always
// shown alongside the question elsewhere in the app too.
function formatGameDate(iso: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(new Date(iso))
}

// "A or B" / "A, B, or C" - a finalist list is a real either/or question, not
// a plain enumeration, so it reads as one the way a comma-only join wouldn't.
function joinWithOr(items: string[]): string {
	if (items.length <= 1) return items.join("")
	if (items.length === 2) return `${items[0]} or ${items[1]}`
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`
}

// The one place a question's title is decided - generated from the shape's
// own validated structured fields at creation time. The create-question form
// prefills the creator's title field from this rather than trusting it as
// the only source, so most titles stay consistent in format/voice without
// blocking on getting every template's phrasing perfect (see title on
// createQuestionSchema).
export function generateQuestionTitle(input: TitleInput): string {
	const base = match(input)
		.with(
			{ shape: "player_stat_over_under" },
			({ playerName, statName, ouLine, opponentTeamName }) =>
				`${playerName}: over/under ${ouLine} ${statName} vs ${opponentTeamName}`,
		)
		.with(
			{ shape: "team_stat_over_under" },
			({ teamName, statName, ouLine, opponentTeamName }) =>
				`${teamName}: over/under ${ouLine} ${statName} vs ${opponentTeamName}`,
		)
		.with(
			{ shape: "player_season_stat_over_under" },
			({ playerName, statName, ouLine, statAggregation }) =>
				statAggregation === "per_game"
					? `${playerName}: over/under ${ouLine} ${statName} per game this season`
					: `${playerName}: over/under ${ouLine} ${statName} this season`,
		)
		.with(
			{ shape: "team_season_stat_over_under" },
			({ teamName, statName, ouLine, statAggregation }) =>
				statAggregation === "per_game"
					? `${teamName}: over/under ${ouLine} ${statName} per game this season`
					: `${teamName}: over/under ${ouLine} ${statName} this season`,
		)
		.with(
			{ shape: "game_total_over_under" },
			({ awayTeamName, homeTeamName, statName, ouLine }) =>
				`${awayTeamName} @ ${homeTeamName}: over/under ${ouLine} ${statName}`,
		)
		.with(
			{ shape: "player_stat_numeric_guess" },
			({ playerName, statName, opponentTeamName }) =>
				`Guess ${playerName}'s ${statName} vs ${opponentTeamName}`,
		)
		.with(
			{ shape: "team_stat_numeric_guess" },
			({ teamName, statName, opponentTeamName }) =>
				`Guess ${teamName}'s ${statName} vs ${opponentTeamName}`,
		)
		.with(
			{ shape: "player_vs_player" },
			({ playerAName, playerBName, statName }) =>
				`${statName}: ${playerAName} vs ${playerBName}`,
		)
		.with(
			{ shape: "player_vs_player_season" },
			({ playerAName, playerBName, statName, statAggregation }) =>
				statAggregation === "per_game"
					? `${statName}: ${playerAName} vs ${playerBName} per game this season`
					: `${statName}: ${playerAName} vs ${playerBName} this season`,
		)
		.with(
			{ shape: "team_vs_team" },
			({ awayTeamName, homeTeamName }) =>
				`${awayTeamName} @ ${homeTeamName}: who will win?`,
		)
		.with({ shape: "yes_no_prop" }, ({ subjectName, eventClause }) =>
			subjectName
				? `Will ${subjectName} ${eventClause}?`
				: `Will ${eventClause}?`,
		)
		.with({ shape: "player_season_award" }, ({ awardName, picksRequired }) =>
			picksRequired > 1
				? `Pick the ${awardName} (${picksRequired})`
				: `Who will win ${awardName}?`,
		)
		.with({ shape: "team_season_award" }, ({ awardName, picksRequired }) =>
			picksRequired > 1
				? `Pick the ${awardName} (${picksRequired})`
				: `Who will win ${awardName}?`,
		)
		.with(
			{ shape: "player_award_finalists" },
			({ awardName, finalistNames }) =>
				`Who will win ${awardName}: ${joinWithOr(finalistNames)}?`,
		)
		.exhaustive()

	return input.gameDate ? `${base} (${formatGameDate(input.gameDate)})` : base
}

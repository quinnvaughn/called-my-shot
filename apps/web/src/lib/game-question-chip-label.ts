import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"

export type ChipLabelQuestion = {
	shape: QuestionShape
	stat: { name: string } | null
	subjectTeam: { abbreviation: string } | null
	subjectPlayer: { name: string } | null
	options: { label: string }[]
}

// Keyed on the stat names the game question catalog asks about
// (apps/api/src/db/catalog/game-question-catalog.ts). Stats carry no
// abbreviation of their own, so anything not listed shows its full name.
const STAT_ABBREVIATIONS: Record<string, string> = {
	Points: "PTS",
	Rebounds: "REB",
	Assists: "AST",
	Blocks: "BLK",
	"3-Pointers Made": "3PM",
	"Passing Yards": "PASS YDS",
	"Rushing Yards": "RUSH YDS",
	"Rushing + Receiving Yards": "RUSH+REC YDS",
	"Receiving Yards": "REC YDS",
	Receptions: "REC",
	Sacks: "SACKS",
	Runs: "R",
	Hits: "H",
	RBIs: "RBI",
	"Home Runs": "HR",
	"Total Bases": "TB",
	"Strikeouts (Pitching)": "K",
	"Pitches Thrown": "PC",
}

export function statAbbreviation(statName: string): string {
	return STAT_ABBREVIATIONS[statName] ?? statName
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"])

export function playerLastName(fullName: string): string {
	const parts = fullName.trim().split(/\s+/)
	const named = parts.filter(
		(part, i) =>
			i === 0 || !NAME_SUFFIXES.has(part.toLowerCase().replace(/[.,]/g, "")),
	)
	return (named.at(-1) ?? fullName).replace(/,$/, "")
}

// The short text on a question's chip in GameStrip. Null when the question
// doesn't carry what its label is built from; the strip shows its position
// instead.
export function gameQuestionChipLabel(
	question: ChipLabelQuestion,
): string | null {
	const { stat, subjectTeam, subjectPlayer, options } = question
	const playerLabel = subjectPlayer ? playerLastName(subjectPlayer.name) : null

	return (
		match(question.shape)
			.returnType<string | null>()
			.with("TEAM_VS_TEAM", () => "Winner")
			.with("TEAM_STAT_NUMERIC_GUESS", "TEAM_STAT_OVER_UNDER", () =>
				subjectTeam && stat
					? `${subjectTeam.abbreviation} ${statAbbreviation(stat.name)}`
					: null,
			)
			.with(
				"PLAYER_STAT_OVER_UNDER",
				"PLAYER_STAT_NUMERIC_GUESS",
				() => playerLabel,
			)
			.with("PLAYER_VS_PLAYER", () => {
				const [a, b] = options
				return a && b
					? `${playerLastName(a.label)} v ${playerLastName(b.label)}`
					: null
			})
			// Sits under the strip's "Game leader" section, which says what it is.
			.with("PLAYER_GAME_STAT_LEADER", () =>
				stat ? statAbbreviation(stat.name) : null,
			)
			.with("GAME_TOTAL_OVER_UNDER", () => "Total")
			.with(
				"YES_NO_PROP",
				() => playerLabel ?? subjectTeam?.abbreviation ?? null,
			)
			// Season-long shapes never sit on a game.
			.with(
				"PLAYER_SEASON_STAT_OVER_UNDER",
				"TEAM_SEASON_STAT_OVER_UNDER",
				"TEAM_SEASON_STAT_NUMERIC_GUESS",
				"PLAYER_SEASON_STAT_LEADER",
				"PLAYER_TEAM_SEASON_STAT_LEADER",
				"PLAYER_VS_PLAYER_SEASON",
				"TEAM_VS_TEAM_SEASON",
				"PLAYER_SEASON_AWARD",
				"TEAM_SEASON_AWARD",
				"PLAYER_AWARD_FINALISTS",
				() => null,
			)
			.exhaustive()
	)
}

// Labels for every question on one game. Two that come out the same (one
// player with lines on two stats) each get their stat appended.
export function gameQuestionChipLabels(
	questions: ChipLabelQuestion[],
): (string | null)[] {
	const labelled = questions.map((question) => ({
		question,
		label: gameQuestionChipLabel(question),
	}))
	const counts = new Map<string, number>()
	for (const { label } of labelled) {
		if (label) counts.set(label, (counts.get(label) ?? 0) + 1)
	}
	return labelled.map(({ question, label }) => {
		if (!label || !question.stat || (counts.get(label) ?? 0) < 2) return label
		const abbreviation = statAbbreviation(question.stat.name)
		return label.endsWith(abbreviation) ? label : `${label} ${abbreviation}`
	})
}

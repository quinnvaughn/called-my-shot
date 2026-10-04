import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { formatGuess } from "#/lib/field-signal"
import {
	type ChipLabelQuestion,
	gameQuestionChipLabel,
	playerLastName,
	statAbbreviation,
} from "#/lib/game-question-chip-label"
import { GAME_WINNER_LABEL } from "#/lib/official-game-questions"

// Never on a game, so never in the rail.
const SEASON_SHAPES = [
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
] as const satisfies readonly QuestionShape[]

export type RailTone = "success" | "danger" | "muted" | "default"

// What a called question is about, short enough for one line of the game
// page's rail. Longer than its GameStrip chip, which sits under a section
// heading the rail doesn't have, so the stat is always named.
export function gameCallsRailLabel(
	question: ChipLabelQuestion & { title: string },
): string {
	const stat = question.stat ? statAbbreviation(question.stat.name) : null
	const chip = gameQuestionChipLabel(question)
	return (
		match(question.shape)
			.returnType<string | null>()
			.with("TEAM_VS_TEAM", () => GAME_WINNER_LABEL)
			.with("GAME_TOTAL_OVER_UNDER", () => "Game total")
			.with("PLAYER_STAT_OVER_UNDER", "PLAYER_STAT_NUMERIC_GUESS", () =>
				question.subjectPlayer && stat
					? `${playerLastName(question.subjectPlayer.name)} ${stat}`
					: null,
			)
			.with("PLAYER_VS_PLAYER", () => (chip && stat ? `${chip} ${stat}` : chip))
			.with("PLAYER_GAME_STAT_LEADER", () => (stat ? `${stat} leader` : null))
			.with(
				"TEAM_STAT_OVER_UNDER",
				"TEAM_STAT_NUMERIC_GUESS",
				"YES_NO_PROP",
				...SEASON_SHAPES,
				() => chip,
			)
			.exhaustive() ?? question.title
	)
}

export type LiveReadingInput = {
	value: number | null
	optionValues: { optionId: string; value: number | null }[] | null
} | null

export type LiveStanding = {
	value: string
	// Says what the number means against the pick, where the number alone
	// doesn't: who's ahead on a comparison, "so far" on a single stat.
	detail: string
	tone: RailTone
}

// Where the viewer's pick stands while the game is on, from the question's
// live reading. Null when there's no reading yet. A single number is never
// toned: an Under that's under at halftime hasn't won anything.
export function liveStanding({
	shape,
	reading,
	pickedOptionIds,
	isRate,
}: {
	shape: QuestionShape
	reading: LiveReadingInput
	pickedOptionIds: string[]
	isRate: boolean
}): LiveStanding | null {
	if (!reading) return null
	const fmt = (v: number) => formatGuess(v, isRate)

	if (reading.value !== null) {
		return { value: fmt(reading.value), detail: "so far", tone: "default" }
	}
	const options = reading.optionValues
	if (!options) return null
	// A side with nothing in the box score yet has done nothing yet.
	const valueOf = (o: { value: number | null }) => o.value ?? 0
	const picked = options.find((o) => pickedOptionIds.includes(o.optionId))
	if (!picked) return null

	return match(shape)
		.returnType<LiveStanding | null>()
		.with("PLAYER_GAME_STAT_LEADER", () => {
			const mine = valueOf(picked)
			const max = Math.max(0, ...options.map(valueOf))
			return mine === max && max > 0
				? { value: fmt(mine), detail: "Leading", tone: "success" }
				: { value: fmt(mine), detail: `Leader has ${fmt(max)}`, tone: "muted" }
		})
		.with("PLAYER_VS_PLAYER", "TEAM_VS_TEAM", () => {
			const other = options.find((o) => o.optionId !== picked.optionId)
			if (!other) return null
			const mine = valueOf(picked)
			const theirs = valueOf(other)
			const value = `${fmt(mine)}–${fmt(theirs)}`
			if (mine > theirs) return { value, detail: "Leading", tone: "success" }
			if (mine < theirs) return { value, detail: "Trailing", tone: "danger" }
			return { value, detail: "Tied", tone: "muted" }
		})
		// Single-number shapes were read off reading.value above.
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_OVER_UNDER",
			"TEAM_STAT_NUMERIC_GUESS",
			"GAME_TOTAL_OVER_UNDER",
			"YES_NO_PROP",
			...SEASON_SHAPES,
			() => null,
		)
		.exhaustive()
}

import { requiresStatAggregation } from "@called-my-shot/schemas"
import {
	isNumericGuessShape,
	isOverUnderShape,
	isSeasonLongShape,
	SHAPE_SUBJECT,
} from "@called-my-shot/scoring"
import { FieldHint } from "#/components/ui/field-hint"
import { useQuestionData } from "../data-context"
import type { CreateQuestionValues } from "../form-context"
import { ChipField, NumberField, useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { StatPicker } from "../stat-picker"
import { SubjectPicker } from "../subject-picker"
import { ShapePanel } from "./shape-panel"

export type StatShape = Extract<
	CreateQuestionValues["shape"],
	| "player_stat_over_under"
	| "team_stat_over_under"
	| "player_season_stat_over_under"
	| "team_season_stat_over_under"
	| "game_total_over_under"
	| "player_stat_numeric_guess"
	| "team_stat_numeric_guess"
	| "team_season_stat_numeric_guess"
>

// The five over/unders and three numeric guesses. One panel across all eight
// because they ask for the same things in the same order - the differences all
// fall out of the shape itself: who the stat belongs to, whether a game scopes
// it, and whether there's a line to set.
export function StatPanel({ shape }: { shape: StatShape }) {
	const leagueId = useWatch("leagueId")
	const { stats, scopedTeams, scopedPlayers, selectedGame } =
		useQuestionData("StatPanel")

	// "none" is game_total_over_under, whose subject is the game itself - which
	// is exactly why it's the one shape here with no subject picker.
	const subject = SHAPE_SUBJECT[shape]
	const isAnyOU = isOverUnderShape(shape)

	return (
		<ShapePanel label={isAnyOU ? "The number" : "The stat"}>
			<LeagueField />
			{!isSeasonLongShape(shape) && (
				<GameField leagueId={leagueId} selectedGame={selectedGame} required />
			)}
			{leagueId ? (
				<>
					<StatPicker
						stats={stats.filter(
							(s) =>
								s.appliesTo === "BOTH" ||
								s.appliesTo === (subject === "player" ? "PLAYER" : "TEAM"),
						)}
						catalogOnly={isNumericGuessShape(shape)}
					/>
					{isAnyOU && (
						<NumberField
							name="ouLine"
							label="Number"
							required
							// "any", not a fixed 0.5 - a rate-stat line (batting average,
							// ERA) needs finer-grained decimals than a counting-stat one.
							step="any"
							placeholder="224.5"
							description="Can't be a whole number - the result has to be able to land on one side or the other, never exactly on it."
						/>
					)}
					{requiresStatAggregation(shape) && (
						<ChipField
							name="statAggregation"
							label="Total or per game"
							required
							options={[
								["total", "Total"],
								["per_game", "Per game"],
							]}
						/>
					)}
					{subject !== "none" && (
						<SubjectPicker
							teams={scopedTeams}
							players={scopedPlayers}
							kind={subject}
							required
						/>
					)}
				</>
			) : (
				<FieldHint>
					Pick a league above to choose the stat and subject - both pull from
					that league's catalog.
				</FieldHint>
			)}
		</ShapePanel>
	)
}

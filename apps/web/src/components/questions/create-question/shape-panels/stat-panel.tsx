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
import { ChipField, useSetValue, useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { LineField } from "../line-field"
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
//
// Fields run league -> game -> subject -> stat -> aggregation -> number, so
// each one sits after whatever scopes it: the league scopes both the games and
// the stat catalog, the game scopes the subject pool, and the number is last
// because its seeded starting value depends on the stat and the total/per-game
// reading of it.
export function StatPanel({ shape }: { shape: StatShape }) {
	const leagueId = useWatch("leagueId")
	const setValue = useSetValue()
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
					{subject !== "none" && (
						<SubjectPicker
							teams={scopedTeams}
							players={scopedPlayers}
							kind={subject}
							required
						/>
					)}
					<StatPicker
						stats={stats.filter(
							(s) =>
								s.appliesTo === "BOTH" ||
								s.appliesTo === (subject === "player" ? "PLAYER" : "TEAM"),
						)}
						catalogOnly={isNumericGuessShape(shape)}
					/>
					{requiresStatAggregation(shape) && (
						<ChipField
							name="statAggregation"
							label="Total or per game"
							required
							options={[
								["total", "Total"],
								["per_game", "Per game"],
							]}
							// A line is set for one reading of the stat: total and
							// per-game differ by a season's worth of games.
							onValueChange={() => setValue("ouLine", undefined)}
						/>
					)}
					{isAnyOU && <LineField />}
				</>
			) : (
				<FieldHint>
					Pick a league above to choose the subject and stat - both pull from
					that league's catalog.
				</FieldHint>
			)}
		</ShapePanel>
	)
}

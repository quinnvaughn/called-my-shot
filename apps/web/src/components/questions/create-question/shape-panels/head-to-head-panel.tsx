import { requiresStatAggregation } from "@called-my-shot/schemas"
import { isSeasonLongShape, SHAPE_SUBJECT } from "@called-my-shot/scoring"
import { match } from "ts-pattern"
import { useQuestionData } from "../data-context"
import type { CreateQuestionValues } from "../form-context"
import { ChipField, useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { OptionList } from "../option-list"
import { StatPicker } from "../stat-picker"
import { toPlayerItems, toTeamItems } from "../use-entity-pools"
import { PanelNote } from "./panel-note"
import { ShapePanel } from "./shape-panel"

export type HeadToHeadShape = Extract<
	CreateQuestionValues["shape"],
	"player_vs_player" | "player_vs_player_season" | "team_vs_team_season"
>

// team_vs_team is deliberately not one of these - its two options are the
// game's own sides, so it has no stat and no option list at all. See
// matchup-panel.
export function HeadToHeadPanel({ shape }: { shape: HeadToHeadShape }) {
	const leagueId = useWatch("leagueId")
	const { stats, teams, players, scopedPlayers, selectedGame } =
		useQuestionData("HeadToHeadPanel")

	// Narrowed to "player" | "team" by HeadToHeadShape - none of these three is
	// a subjectless shape.
	const subject = SHAPE_SUBJECT[shape]
	const isSeasonScoped = isSeasonLongShape(shape)

	const items =
		subject === "team"
			? toTeamItems(teams)
			: toPlayerItems(isSeasonScoped ? players : scopedPlayers)

	// player_vs_player_season has none, and that's deliberate - the other two
	// are each clarifying something specific about their own scope.
	const note = match(shape)
		.with(
			"player_vs_player",
			() => "Both from this game - teammates or opponents, either works.",
		)
		.with(
			"team_vs_team_season",
			() =>
				"Season-long, no game attached - any two teams in the league, division rivals or not.",
		)
		.with("player_vs_player_season", () => null)
		.exhaustive()

	return (
		<ShapePanel label="The comparison">
			<LeagueField />
			{!isSeasonScoped && (
				<GameField leagueId={leagueId} selectedGame={selectedGame} required />
			)}
			<StatPicker
				stats={stats.filter(
					(s) =>
						s.appliesTo === "BOTH" ||
						s.appliesTo === (subject === "player" ? "PLAYER" : "TEAM"),
				)}
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
				/>
			)}
			<OptionList
				items={items}
				rowPlaceholder={subject === "player" ? "Player name" : "Team name"}
				addLabel={subject === "player" ? "+ Add player" : "+ Add team"}
				exactCount={2}
				rowLabels={
					subject === "player" ? ["Player A", "Player B"] : ["Team A", "Team B"]
				}
			/>
			{note && <PanelNote>{note}</PanelNote>}
		</ShapePanel>
	)
}

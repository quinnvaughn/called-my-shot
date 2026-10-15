import { useQuestionData } from "#/components/questions/create-question/data-context"
import { ChipField } from "#/components/questions/create-question/form-context"
import { LeagueField } from "#/components/questions/create-question/league-field"
import { OptionList } from "#/components/questions/create-question/option-list"
import { StatPicker } from "#/components/questions/create-question/stat-picker"
import { PanelNote } from "./panel-note"
import { ShapePanel } from "./shape-panel"

// player_season_stat_leader - nothing scopes this to a game, so the creator
// names the contenders themselves.
export function SeasonStatLeaderPanel() {
	const { stats, seasonStatLeaderItems, offersStatAggregation } =
		useQuestionData("SeasonStatLeaderPanel")

	return (
		<ShapePanel label="The stat leader">
			<LeagueField />
			<StatPicker
				stats={stats.filter(
					(s) => s.appliesTo === "BOTH" || s.appliesTo === "PLAYER",
				)}
			/>
			{offersStatAggregation && (
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
				items={seasonStatLeaderItems}
				rowPlaceholder="Player name"
				addLabel="+ Add player"
			/>
			<PanelNote>
				Season-long, no game attached - name the players yourself, three or
				more. Off-catalog stats are allowed here, so advanced metrics work. For
				just two, use Player Season Head-to-Head instead.
			</PanelNote>
		</ShapePanel>
	)
}

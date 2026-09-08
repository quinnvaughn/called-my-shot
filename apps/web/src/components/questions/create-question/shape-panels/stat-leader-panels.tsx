import { FieldHint } from "#/components/ui/field-hint"
import { useQuestionData } from "../data-context"
import { ChipField, useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { OptionList } from "../option-list"
import { PoolSummary } from "../pool-summary"
import { StatPicker } from "../stat-picker"
import { PanelNote, ShapePanel } from "./shape-panel"

// player_game_stat_leader - the pool is both rosters of the picked game, so
// there's nothing to curate row by row.
export function GameStatLeaderPanel() {
	const leagueId = useWatch("leagueId")
	const { stats, selectedGame, gameStatLeaderPoolItems } = useQuestionData(
		"GameStatLeaderPanel",
	)

	return (
		<ShapePanel label="The stat leader">
			<LeagueField />
			<GameField leagueId={leagueId} selectedGame={selectedGame} required />
			<StatPicker
				stats={stats.filter(
					(s) => s.appliesTo === "BOTH" || s.appliesTo === "PLAYER",
				)}
				catalogOnly
			/>
			{gameStatLeaderPoolItems === null ? (
				<FieldHint>Pick a game to see the pool.</FieldHint>
			) : (
				<PoolSummary
					items={gameStatLeaderPoolItems}
					scopeLabel={
						selectedGame
							? `${selectedGame.awayTeam.name} @ ${selectedGame.homeTeam.name}`
							: ""
					}
				/>
			)}
			<PanelNote>
				The pool is both teams' rosters - nothing to curate once a game's
				picked.
			</PanelNote>
		</ShapePanel>
	)
}

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

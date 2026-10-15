import { useQuestionData } from "#/components/questions/create-question/data-context"
import { useWatch } from "#/components/questions/create-question/form-context"
import { GameField } from "#/components/questions/create-question/game-field"
import { LeagueField } from "#/components/questions/create-question/league-field"
import { PoolSummary } from "#/components/questions/create-question/pool-summary"
import { StatPicker } from "#/components/questions/create-question/stat-picker"
import { FieldHint } from "#/components/ui/field-hint"
import { PanelNote } from "./panel-note"
import { ShapePanel } from "./shape-panel"

// player_game_stat_leader - the pool is both rosters of the picked game, less
// the positions that can't lead the stat, so there's nothing to curate row by
// row.
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
				The pool is every player on both teams who can record this stat. Nothing
				to curate once a game's picked.
			</PanelNote>
		</ShapePanel>
	)
}

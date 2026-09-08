import { useQuestionData } from "../data-context"
import { useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { PanelNote, ShapePanel } from "./shape-panel"

// team_vs_team. Its own panel rather than a fourth case of HeadToHeadPanel:
// the two options are the picked game's home and away teams, so there's no
// stat, no aggregation and no option list to configure.
export function MatchupPanel() {
	const leagueId = useWatch("leagueId")
	const { selectedGame } = useQuestionData("MatchupPanel")

	return (
		<ShapePanel label="The matchup">
			<LeagueField />
			<GameField leagueId={leagueId} selectedGame={selectedGame} required />
			<PanelNote>
				The two options are the game's own home and away teams - nothing to
				configure once a game's picked.
			</PanelNote>
		</ShapePanel>
	)
}

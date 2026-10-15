import { useQuestionData } from "../data-context"
import { TextField, useWatch } from "../form-context"
import { GameField } from "../game-field"
import { LeagueField } from "../league-field"
import { SubjectPicker } from "../subject-picker"
import { PanelNote } from "./panel-note"
import { ShapePanel } from "./shape-panel"

// yes_no_prop - the one shape whose question text is written rather than
// generated from a stat and a number.
export function YesNoPanel() {
	const leagueId = useWatch("leagueId")
	const { scopedTeams, scopedPlayers, selectedGame } =
		useQuestionData("YesNoPanel")

	return (
		<ShapePanel label="The proposition">
			<LeagueField />
			<GameField leagueId={leagueId} selectedGame={selectedGame} />
			<TextField
				name="eventClause"
				label="What's being predicted"
				required
				placeholder="records a triple-double tonight"
				description={
					'What follows "Will {subject}…" - e.g. "signs a contract extension by March 1."'
				}
			/>
			<SubjectPicker
				teams={scopedTeams}
				players={scopedPlayers}
				kind="either"
			/>
			<PanelNote>
				Fixed at exactly two options - nothing else to configure.
			</PanelNote>
		</ShapePanel>
	)
}

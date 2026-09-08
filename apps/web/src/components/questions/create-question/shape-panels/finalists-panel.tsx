import { useQuestionData } from "../data-context"
import { TextField } from "../form-context"
import { LeagueField } from "../league-field"
import { OptionList } from "../option-list"
import { ShapePanel } from "./shape-panel"

// player_award_finalists - a small, admin-curated shortlist of the real
// announced finalists, rather than a whole-roster pool.
export function FinalistsPanel() {
	const { finalistItems } = useQuestionData("FinalistsPanel")

	return (
		<ShapePanel label="The award">
			<LeagueField />
			<TextField
				name="awardName"
				label="Award name"
				required
				placeholder="Defensive Player of the Year"
				description={`The award's real name, e.g. "Defensive Player of the Year."`}
			/>
			<OptionList
				items={finalistItems}
				rowPlaceholder="Finalist name"
				addLabel="+ Add finalist"
			/>
		</ShapePanel>
	)
}

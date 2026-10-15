import { Fragment } from "react"
import { BallotSectionHeading } from "#/components/ballots/ballot-section-heading"
import type {
	StandingsRow as StandingsRowData,
	StandingsSection,
} from "#/lib/projected-standings"
import { CutLine } from "./cut-line"
import { StandingsRow } from "./standings-row"
import type { Adjust, MoveHandlers } from "./types"

export function SectionRows({
	section,
	showLosses,
	movesFor,
	adjustFor,
}: {
	section: StandingsSection
	showLosses: boolean
	movesFor: (section: StandingsSection, i: number) => MoveHandlers
	adjustFor: (row: StandingsRowData) => Adjust | null
}) {
	// A line under the last row says nothing the end of the table doesn't.
	const lineAfter = new Map(
		section.lines
			.filter((line) => line.after >= 0 && line.after < section.rows.length - 1)
			.map((line) => [line.after, line.label]),
	)
	return (
		<>
			<BallotSectionHeading label={section.label} />
			{section.rows.map((row, i) => (
				<Fragment key={row.team.questionId}>
					<StandingsRow
						row={row}
						showLosses={showLosses}
						moves={movesFor(section, i)}
						adjust={adjustFor(row)}
					/>
					{lineAfter.has(i) && <CutLine label={lineAfter.get(i) ?? ""} />}
				</Fragment>
			))}
		</>
	)
}

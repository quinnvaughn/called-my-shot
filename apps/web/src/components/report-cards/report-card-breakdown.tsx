import { Fragment } from "react"
import { css } from "styled-system/css"
import {
	ReportCardBonusRow,
	type ReportCardBonusRowData,
} from "./report-card-bonus-row"
import { ReportCardRow, type ReportCardRowData } from "./report-card-row"

// The breakdown as a whole. On the inline card every row is a family. On the
// permalink each family is followed by every shape inside it, so the rows
// stay at one predictable grain. Bonuses close it out.
export function ReportCardBreakdown({
	families,
	shapesByFamily,
	bonuses = [],
}: {
	families: (ReportCardRowData & { family: string })[]
	// Omitted on the inline card, which stays at family grain. Supplied on the
	// permalink, where there's room for the finer read.
	shapesByFamily?: Record<string, ReportCardRowData[]>
	bonuses?: ReportCardBonusRowData[]
}) {
	if (families.length === 0) return null
	return (
		<div
			className={css({
				display: "grid",
				// Label on its own line above the numbers on narrow screens, so
				// the numbers take the first four columns; from sm up the label
				// fills the left and the numbers hug the right.
				gridTemplateColumns: {
					base: "auto auto auto auto 1fr",
					sm: "1fr auto auto auto auto",
				},
				columnGap: "3",
				borderTop: "1px solid {colors.border.default}",
				paddingTop: "2",
			})}
		>
			{families.map((family) => {
				const shapes = shapesByFamily?.[family.family] ?? []
				return (
					<Fragment key={family.family}>
						<ReportCardRow row={family} />
						{/* Every shape, including a family that holds only one.
						    Repeating the parent's numbers there is the point: it
						    says the family IS that shape, which is information the
						    family row alone doesn't carry. Suppressing it made a
						    page where one family split and three didn't read as
						    arbitrary. */}
						{shapes.map((shape) => (
							<ReportCardRow key={shape.label} row={shape} nested />
						))}
					</Fragment>
				)
			})}
			{bonuses.map((bonus) => (
				<ReportCardBonusRow key={bonus.label} row={bonus} />
			))}
		</div>
	)
}

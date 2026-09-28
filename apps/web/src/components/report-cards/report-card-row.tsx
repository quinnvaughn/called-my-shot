import { Fragment } from "react"
import { css } from "styled-system/css"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { formatReturn, returnTone } from "#/lib/report-card"

export type ReportCardRowData = {
	label: string
	wins: number
	losses: number
	pendingCount: number
	netPoints: number
	returnPct: number | null
}

type Props = {
	row: ReportCardRowData
	// A shape row sitting under its family row, indented and quieter.
	nested?: boolean
}

// One line of the breakdown, used at both grains: a family row on the card,
// and the shape rows nested under it on the permalink. Same component so a
// family and the shapes inside it can't come out formatted differently.
// Rows take their columns from the breakdown's grid (subgrid), so record,
// open count, points and return line up down the whole breakdown.
export function ReportCardRow({ row, nested = false }: Props) {
	const settled = row.wins + row.losses
	const returnText = formatReturn(row.returnPct)
	return (
		<div
			className={css({
				gridColumn: "1 / -1",
				display: "grid",
				gridTemplateColumns: "subgrid",
				alignItems: "baseline",
				rowGap: "0.5",
				paddingY: "1.5",
			})}
		>
			<span
				className={css({
					// On narrow screens the label takes its own line above the
					// numbers; from sm up it's the first column.
					gridColumn: { base: "1 / -1", sm: "1" },
					paddingLeft: nested ? "4" : "0",
					fontSize: nested ? "xs" : "sm",
					fontWeight: nested ? "normal" : "medium",
					color: nested ? "fg.muted" : "fg.default",
				})}
			>
				{row.label}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					whiteSpace: "nowrap",
					textAlign: "right",
					color: "fg.muted",
				})}
			>
				{settled > 0 ? formatRecord(row.wins, row.losses) : "-"}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					whiteSpace: "nowrap",
					color: "fg.muted",
				})}
			>
				{row.pendingCount > 0 ? `${row.pendingCount} open` : ""}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					whiteSpace: "nowrap",
					textAlign: "right",
					color: returnTone(row.netPoints),
				})}
			>
				{settled > 0 ? formatSignedPoints(row.netPoints) : ""}
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					whiteSpace: "nowrap",
					textAlign: "right",
					color: returnTone(row.returnPct),
				})}
			>
				{settled > 0 ? returnText : ""}
			</span>
		</div>
	)
}

// The breakdown as a whole. On the inline card every row is a family. On the
// permalink each family is followed by every shape inside it, so the rows
// stay at one predictable grain.
export function ReportCardBreakdown({
	families,
	shapesByFamily,
}: {
	families: (ReportCardRowData & { family: string })[]
	// Omitted on the inline card, which stays at family grain. Supplied on the
	// permalink, where there's room for the finer read.
	shapesByFamily?: Record<string, ReportCardRowData[]>
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
		</div>
	)
}

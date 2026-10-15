import { css, cx } from "styled-system/css"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import { formatReturn } from "#/lib/report-card"

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
					textStyle: "meta",
					whiteSpace: "nowrap",
					// On narrow screens the record starts the numbers line, so it
					// sits flush under its label (indented with it on a shape row)
					// rather than right-aligning away from it.
					textAlign: { base: "left", sm: "right" },
					paddingLeft: nested ? { base: "4", sm: "0" } : "0",
					color: "fg.muted",
				})}
			>
				{settled > 0 ? formatRecord(row.wins, row.losses) : "-"}
			</span>
			<span
				className={css({
					textStyle: "meta",
					whiteSpace: "nowrap",
					color: "fg.muted",
				})}
			>
				{row.pendingCount > 0 ? `${row.pendingCount} open` : ""}
			</span>
			<span
				className={cx(
					css({
						textStyle: "meta",
						whiteSpace: "nowrap",
						textAlign: "right",
					}),
					signTone(row.netPoints),
				)}
			>
				{settled > 0 ? formatSigned(row.netPoints, { zeroSign: true }) : ""}
			</span>
			<span
				className={cx(
					css({
						textStyle: "meta",
						whiteSpace: "nowrap",
						textAlign: "right",
					}),
					signTone(row.returnPct),
				)}
			>
				{settled > 0 ? returnText : ""}
			</span>
		</div>
	)
}

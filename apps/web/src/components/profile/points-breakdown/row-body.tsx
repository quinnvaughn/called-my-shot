import type { ReactNode } from "react"
import { css, cx } from "styled-system/css"
import { Grid, HStack } from "styled-system/jsx"
import { signTone } from "#/components/ui/sign-tone"
import { formatSigned } from "#/lib/format-number"
import {
	type ColumnWidths,
	type PointsRow,
	recordText,
} from "#/lib/points-breakdown"
import { formatReturn } from "#/lib/report-card"

const valueText = css({
	textStyle: "metaLg",
	whiteSpace: "nowrap",
})

export function RowBody({
	row,
	max,
	columns,
	lead,
	nested = false,
}: {
	row: PointsRow
	max: number
	columns: ColumnWidths
	lead?: ReactNode
	nested?: boolean
}) {
	const width = `${(Math.abs(row.netPoints) / max) * 100}%`
	const ret = formatReturn(row.returnPct)

	return (
		// On a phone the label and numbers share the first line and the bar
		// gets the full width under them, rather than splitting one line with
		// the numbers. From sm up it's one line: label, bar, numbers.
		<Grid
			gridTemplateColumns={{
				base: "minmax(0, 1fr) auto",
				sm: "10rem minmax(0, 1fr) auto",
			}}
			gridTemplateAreas={{
				base: '"label values" "bar bar"',
				sm: '"label bar values"',
			}}
			columnGap="3"
			rowGap="1.5"
			alignItems="center"
		>
			<span
				className={cx(
					css({
						gridArea: "label",
						display: "flex",
						alignItems: "center",
						gap: "2",
						fontSize: "sm",
						minWidth: "0",
					}),
					nested
						? css({ color: "fg.body" })
						: css({ color: "fg.default", fontWeight: "medium" }),
				)}
			>
				{lead}
				{row.icon}
				{row.label}
			</span>
			<div
				aria-hidden
				className={css({
					gridArea: "bar",
					display: "flex",
					minWidth: "0",
					height: "2.5",
				})}
			>
				<div
					className={css({
						flex: "1",
						display: "flex",
						justifyContent: "flex-end",
						borderRight: "1px solid {colors.border.emphasized}",
					})}
				>
					{row.netPoints < 0 && (
						<div
							className={css({
								bg: "danger.default",
								borderRadius: "4px 0 0 4px",
							})}
							style={{ width }}
						/>
					)}
				</div>
				<div className={css({ flex: "1", display: "flex" })}>
					{row.netPoints > 0 && (
						<div
							className={css({
								bg: "success.vibrant",
								borderRadius: "0 4px 4px 0",
							})}
							style={{ width }}
						/>
					)}
				</div>
			</div>
			<HStack
				gap="3"
				justify="flex-end"
				gridArea="values"
				className={valueText}
			>
				<span
					className={cx(signTone(row.netPoints), css({ textAlign: "right" }))}
					style={{ width: `${columns.points}ch` }}
				>
					{formatSigned(row.netPoints, { zeroSign: true })}
				</span>
				<span
					className={css({
						color: "fg.muted",
						textAlign: "right",
					})}
					style={{ width: `${columns.record}ch` }}
				>
					{recordText(row)}
				</span>
				<span
					className={css({
						color: "fg.muted",
						textAlign: "right",
					})}
					style={{ width: `${columns.ret}ch` }}
				>
					{ret ?? ""}
				</span>
			</HStack>
		</Grid>
	)
}

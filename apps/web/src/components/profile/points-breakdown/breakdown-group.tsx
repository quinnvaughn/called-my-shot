import { useState } from "react"
import { FiChevronDown } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { ChipButton } from "#/components/ui/chip-button"
import {
	biggestSwing,
	type ColumnWidths,
	type PointsGroup,
	type PointsRow,
} from "#/lib/points-breakdown"
import { BreakdownRow } from "./breakdown-row"

const groupLabel = css({
	textStyle: "label",
	color: "fg.muted",
	paddingX: "2",
})

export function BreakdownGroup({
	group,
	max,
	columns,
	username,
	divided,
}: {
	group: PointsGroup
	max: number
	columns: ColumnWidths
	username: string
	divided: boolean
}) {
	const [selected, setSelected] = useState(0)
	const [unfolded, setUnfolded] = useState(false)
	const view = group.views[selected] ?? group.views[0]
	if (!view) return null
	const scale = view.cardScale ? max : biggestSwing([view])

	// Folding away a single row would trade it for a button the same height.
	const folds =
		!unfolded &&
		view.fold !== undefined &&
		view.rows.length > view.fold.ends * 2 + 1
	const rows = (rows: PointsRow[]) =>
		rows.map((row) => (
			<BreakdownRow
				key={row.key}
				row={row}
				max={scale}
				columns={columns}
				username={username}
			/>
		))

	return (
		<VStack
			alignItems="stretch"
			gap="1"
			className={
				divided
					? css({
							borderTop: "1px solid {colors.border.default}",
							paddingTop: "4",
						})
					: undefined
			}
		>
			{group.views.length > 1 ? (
				<HStack gap="1.5" paddingX="2" paddingBottom="1">
					{group.views.map((option, index) => (
						<ChipButton
							key={option.label}
							selected={index === selected}
							pressed={index === selected}
							onClick={() => {
								setSelected(index)
								setUnfolded(false)
							}}
						>
							{option.label}
						</ChipButton>
					))}
				</HStack>
			) : (
				<span className={groupLabel}>{view.label}</span>
			)}
			{folds && view.fold ? (
				<>
					{rows(view.rows.slice(0, view.fold.ends))}
					<button
						type="button"
						onClick={() => setUnfolded(true)}
						className={cx(
							button({ variant: "ghost", size: "sm" }),
							css({ alignSelf: "center" }),
						)}
					>
						{view.fold.label}
						<FiChevronDown />
					</button>
					{rows(view.rows.slice(-view.fold.ends))}
				</>
			) : (
				rows(view.rows)
			)}
			{rows(view.pinned ?? [])}
		</VStack>
	)
}

import { Link } from "@tanstack/react-router"
import { type ReactNode, useState } from "react"
import { FiChevronDown, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { ChipButton } from "#/components/ui/chip-button"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { formatReturn } from "#/lib/report-card"

export type PointsRow = {
	key: string
	label: string
	// Shown before the label, like a team's logo.
	icon?: ReactNode
	netPoints: number
	// Null for a row no call earned, like the bonuses row.
	wins: number | null
	losses: number | null
	returnPct: number | null
	// Shown nested under this row when it's opened.
	children?: PointsRow[]
	// Makes the row a link to the profile scoped to this league.
	leagueSlug?: string
}

// Leagues and play types each account for the same calls, so they're drawn
// as separate labeled groups rather than one list that reads as a hierarchy.
export type PointsView = {
	label: string
	rows: PointsRow[]
	// Keeps this many rows at each end of a long list and folds the middle
	// behind a button, so the best and worst rows stay on screen without the
	// whole list.
	fold?: { ends: number; label: string }
	// Shown after rows and never folded.
	pinned?: PointsRow[]
	// Scales this view's bars against the biggest row on the card instead of
	// its own, for a view with no other rows to be compared with.
	cardScale?: boolean
}

// A group with more than one view splits the same calls more than one way,
// one view on screen at a time.
export type PointsGroup = {
	views: PointsView[]
}

type Props = {
	groups: PointsGroup[]
	username: string
}

const valueText = css({
	fontFamily: "mono",
	fontSize: "xs",
	whiteSpace: "nowrap",
})

function signedTone(points: number): string {
	return points > 0
		? css({ color: "success.default" })
		: points < 0
			? css({ color: "danger.default" })
			: css({ color: "fg.default" })
}

const groupLabel = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "fg.muted",
	paddingX: "2",
})

// The biggest swing among some views' rows, nested and pinned ones included.
function biggestSwing(views: PointsView[]): number {
	return Math.max(
		1,
		...views
			.flatMap((view) => [...view.rows, ...(view.pinned ?? [])])
			.flatMap((row) => [
				Math.abs(row.netPoints),
				...(row.children ?? []).map((child) => Math.abs(child.netPoints)),
			]),
	)
}

// Every row on the card, nested and pinned ones included.
function allRows(views: PointsView[]): PointsRow[] {
	return views
		.flatMap((view) => [...view.rows, ...(view.pinned ?? [])])
		.flatMap((row) => [row, ...(row.children ?? [])])
}

function recordText(row: PointsRow): string {
	return row.wins !== null && row.losses !== null
		? formatRecord(row.wins, row.losses)
		: ""
}

// Each number column's width in characters, set by its longest value on the
// card, so the columns line up across every row and view. The values are in
// a monospace font, so a character count is an exact width.
type ColumnWidths = { points: number; record: number; ret: number }

function columnWidths(views: PointsView[]): ColumnWidths {
	const rows = allRows(views)
	const longest = (text: (row: PointsRow) => string) =>
		Math.max(0, ...rows.map((row) => text(row).length))
	return {
		points: longest((row) => formatSignedPoints(row.netPoints)),
		record: longest(recordText),
		ret: longest((row) => formatReturn(row.returnPct) ?? ""),
	}
}

// Where the points came from, one bar per row out from a shared zero line:
// right and green for what a row netted, left and red for what it cost. Each
// view's bars, nested ones included, are scaled against that view's biggest
// swing, so leagues are compared with leagues and play types with play types.
// A view on the card scale is measured against the biggest swing anywhere on
// the card.
export function PointsBreakdown({ groups, username }: Props) {
	const views = groups.flatMap((group) => group.views)
	const max = biggestSwing(views)
	const columns = columnWidths(views)

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					{groups.map((group, index) => (
						<BreakdownGroup
							key={group.views.map((view) => view.label).join("|")}
							group={group}
							max={max}
							columns={columns}
							username={username}
							divided={index > 0}
						/>
					))}
				</VStack>
			</Card.Body>
		</Card>
	)
}

function BreakdownGroup({
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

function BreakdownRow({
	row,
	max,
	columns,
	username,
}: {
	row: PointsRow
	max: number
	columns: ColumnWidths
	username: string
}) {
	const [open, setOpen] = useState(false)
	const expandable = (row.children?.length ?? 0) > 0

	const chevron = (
		<span className={leadSlot}>
			{open ? <FiChevronDown /> : <FiChevronRight />}
		</span>
	)
	const rowClass = css({
		display: "block",
		width: "full",
		textAlign: "left",
		borderRadius: "md",
		padding: "2",
		_hover: { bg: "bg.subtle" },
	})

	return (
		<VStack alignItems="stretch" gap="0">
			{row.leagueSlug ? (
				<Link
					to="/user/$username"
					params={{ username }}
					search={{ league: row.leagueSlug }}
					className={rowClass}
				>
					<RowBody row={row} max={max} columns={columns} />
				</Link>
			) : expandable ? (
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
					className={cx(rowClass, css({ cursor: "pointer" }))}
				>
					<RowBody row={row} max={max} columns={columns} lead={chevron} />
				</button>
			) : (
				<div className={css({ padding: "2" })}>
					<RowBody row={row} max={max} columns={columns} />
				</div>
			)}
			{open && row.children && (
				<VStack
					alignItems="stretch"
					gap="0"
					className={css({
						position: "relative",
						_before: {
							content: '""',
							position: "absolute",
							top: "0",
							bottom: "0",
							left: "4",
							borderLeft: "1px solid {colors.border.default}",
						},
					})}
				>
					{row.children.map((child) => (
						<div key={child.key} className={css({ padding: "2" })}>
							<RowBody
								row={child}
								max={max}
								columns={columns}
								lead={<span aria-hidden className={leadSlot} />}
								nested
							/>
						</div>
					))}
				</VStack>
			)}
		</VStack>
	)
}

// Holds a row's chevron, or the matching gap on a nested row, inside the
// label column, so every row's bar track starts and ends at the same x and
// the zero lines stack.
const leadSlot = css({
	display: "flex",
	justifyContent: "center",
	width: "4",
	flexShrink: "0",
	color: "fg.muted",
})

function RowBody({
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
					className={cx(
						signedTone(row.netPoints),
						css({ textAlign: "right" }),
					)}
					style={{ width: `${columns.points}ch` }}
				>
					{formatSignedPoints(row.netPoints)}
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

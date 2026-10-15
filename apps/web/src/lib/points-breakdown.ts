import type { ReactNode } from "react"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
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

// The biggest swing among some views' rows, nested and pinned ones included.
export function biggestSwing(views: PointsView[]): number {
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

export function recordText(row: PointsRow): string {
	return row.wins !== null && row.losses !== null
		? formatRecord(row.wins, row.losses)
		: ""
}

// Each number column's width in characters, set by its longest value on the
// card, so the columns line up across every row and view. The values are in
// a monospace font, so a character count is an exact width.
export type ColumnWidths = { points: number; record: number; ret: number }

export function columnWidths(views: PointsView[]): ColumnWidths {
	const rows = allRows(views)
	const longest = (text: (row: PointsRow) => string) =>
		Math.max(0, ...rows.map((row) => text(row).length))
	return {
		points: longest((row) => formatSigned(row.netPoints, { zeroSign: true })),
		record: longest(recordText),
		ret: longest((row) => formatReturn(row.returnPct) ?? ""),
	}
}

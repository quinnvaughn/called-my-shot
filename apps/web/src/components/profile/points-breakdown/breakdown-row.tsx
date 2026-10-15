import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import type { ColumnWidths, PointsRow } from "#/lib/points-breakdown"
import { RowBody } from "./row-body"
import { leadSlot } from "./styles"

export function BreakdownRow({
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

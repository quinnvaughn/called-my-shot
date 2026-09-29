import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown, FiChevronRight } from "react-icons/fi"
import { css, cx } from "styled-system/css"
import { Flex, HStack, VStack } from "styled-system/jsx"
import { Card } from "#/components/ui/card"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { formatReturn } from "#/lib/report-card"

export type PointsRow = {
	key: string
	label: string
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
export type PointsGroup = {
	label: string
	rows: PointsRow[]
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

// Where the points came from, one bar per row out from a shared zero line:
// right and green for what a row netted, left and red for what it cost. Every
// bar, nested ones and every group included, is scaled against the biggest
// swing on the card, so a short bar always means a small share of the total.
export function PointsBreakdown({ groups, username }: Props) {
	const max = Math.max(
		1,
		...groups
			.flatMap((group) => group.rows)
			.flatMap((row) => [
				Math.abs(row.netPoints),
				...(row.children ?? []).map((child) => Math.abs(child.netPoints)),
			]),
	)

	return (
		<Card variant="surface" size="md">
			<Card.Body>
				<VStack alignItems="stretch" gap="4">
					{groups.map((group, index) => (
						<VStack
							key={group.label}
							alignItems="stretch"
							gap="1"
							className={
								index > 0
									? css({
											borderTop: "1px solid {colors.border.default}",
											paddingTop: "4",
										})
									: undefined
							}
						>
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "fg.muted",
									paddingX: "2",
								})}
							>
								{group.label}
							</span>
							{group.rows.map((row) => (
								<BreakdownRow
									key={row.key}
									row={row}
									max={max}
									username={username}
								/>
							))}
						</VStack>
					))}
				</VStack>
			</Card.Body>
		</Card>
	)
}

function BreakdownRow({
	row,
	max,
	username,
}: {
	row: PointsRow
	max: number
	username: string
}) {
	const [open, setOpen] = useState(false)
	const expandable = (row.children?.length ?? 0) > 0

	const body = <RowBody row={row} max={max} />
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
					{body}
				</Link>
			) : expandable ? (
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
					className={cx(rowClass, css({ cursor: "pointer" }))}
				>
					<HStack gap="1.5" alignItems="flex-start">
						<span className={css({ color: "fg.muted", paddingTop: "0.5" })}>
							{open ? <FiChevronDown /> : <FiChevronRight />}
						</span>
						<div className={css({ flex: "1", minWidth: "0" })}>{body}</div>
					</HStack>
				</button>
			) : (
				<div className={css({ padding: "2" })}>{body}</div>
			)}
			{open && row.children && (
				<VStack
					alignItems="stretch"
					gap="0"
					className={css({
						marginLeft: "5",
						borderLeft: "1px solid {colors.border.default}",
						paddingLeft: "1",
					})}
				>
					{row.children.map((child) => (
						<div key={child.key} className={css({ padding: "2" })}>
							<RowBody row={child} max={max} nested />
						</div>
					))}
				</VStack>
			)}
		</VStack>
	)
}

function RowBody({
	row,
	max,
	nested = false,
}: {
	row: PointsRow
	max: number
	nested?: boolean
}) {
	const width = `${(Math.abs(row.netPoints) / max) * 100}%`
	const ret = formatReturn(row.returnPct)

	return (
		// Label on its own line on a phone, beside the bar from sm up, so a
		// long shape name wraps without squeezing the bar.
		<Flex
			direction={{ base: "column", sm: "row" }}
			alignItems={{ base: "stretch", sm: "center" }}
			gap={{ base: "1", sm: "3" }}
		>
			<span
				className={cx(
					css({
						fontSize: "sm",
						flexShrink: "0",
						sm: { width: "40" },
					}),
					nested
						? css({ color: "fg.body" })
						: css({ color: "fg.default", fontWeight: "medium" }),
				)}
			>
				{row.label}
			</span>
			<HStack gap="3" flex="1" minWidth="0">
				<div
					aria-hidden
					className={css({
						display: "flex",
						flex: "1",
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
				<HStack gap="3" flexShrink="0" justify="flex-end" className={valueText}>
					<span
						className={cx(
							signedTone(row.netPoints),
							css({ minWidth: "12", textAlign: "right" }),
						)}
					>
						{formatSignedPoints(row.netPoints)}
					</span>
					<span
						className={css({
							color: "fg.muted",
							minWidth: "10",
							textAlign: "right",
						})}
					>
						{row.wins !== null && row.losses !== null
							? formatRecord(row.wins, row.losses)
							: ""}
					</span>
					<span
						className={css({
							color: "fg.muted",
							minWidth: "10",
							textAlign: "right",
						})}
					>
						{ret ?? ""}
					</span>
				</HStack>
			</HStack>
		</Flex>
	)
}

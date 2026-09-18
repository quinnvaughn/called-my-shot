import type { StreakMode } from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"

const rowLink = css({
	display: "block",
	textDecoration: "none",
	color: "inherit",
})

type Props = {
	name: string
	username: string
	leagueAbbr: string
	// The track or slate this row is about: "Winners", "Week 3 Sunday Early".
	label: string
	// The headline number, already in words - "7 in a row", "4 misses in a
	// row", "6 for 6".
	value: string
	// The smaller line under it, if there is one.
	note?: string
	// Where the row goes. Optional so a row can render unlinked, though every
	// list passes one today.
	to?: Destination
}

// The two pages a highlight row can lead to. A union rather than a path
// string, so each arm below keeps the router's typed params.
export type Destination =
	| {
			kind: "streak"
			username: string
			league: string
			family: string
			// Which side of the track this row is about. A hot row and a cold
			// row can name the same track, so the link has to say.
			mode: StreakMode
	  }
	| { kind: "sweep"; username: string; league: string; slateKey: string }

// One member's streak or sweep, as the group highlights band and its sheet
// both list them. Sized to sit three to a column, so the member and the number
// are what read first and everything else is support.
export function HighlightRow({
	name,
	username,
	leagueAbbr,
	label,
	value,
	note,
	to,
}: Props) {
	const body = (
		<Card size="sm" interactive={!!to}>
			<Card.Body>
				<HStack justify="space-between" alignItems="center" gap="3">
					<VStack gap="1" alignItems="flex-start" minWidth="0">
						<Identity name={name} username={username} />
						<HStack gap="2" alignItems="center" minWidth="0">
							<Tag size="sm">{leagueAbbr}</Tag>
							<span
								className={css({
									fontSize: "xs",
									color: "fg.muted",
									minWidth: "0",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								})}
							>
								{label}
							</span>
						</HStack>
					</VStack>
					<VStack gap="0.5" alignItems="flex-end" flexShrink="0">
						<span className={css({ fontFamily: "heading", fontSize: "md" })}>
							{value}
						</span>
						{note && (
							<span
								className={css({
									fontFamily: "mono",
									fontSize: "2xs",
									letterSpacing: "wide",
									textTransform: "uppercase",
									color: "fg.subtle",
								})}
							>
								{note}
							</span>
						)}
					</VStack>
				</HStack>
			</Card.Body>
		</Card>
	)

	if (!to) return body
	return match(to)
		.with({ kind: "streak" }, (d) => (
			<Link
				to="/user/$username/streaks/$league/$family/$mode"
				params={{
					username: d.username,
					league: d.league,
					family: d.family,
					mode: d.mode,
				}}
				className={rowLink}
			>
				{body}
			</Link>
		))
		.with({ kind: "sweep" }, (d) => (
			<Link
				to="/user/$username/sweeps/$league/$slateKey"
				params={{
					username: d.username,
					league: d.league,
					slateKey: d.slateKey,
				}}
				className={rowLink}
			>
				{body}
			</Link>
		))
		.exhaustive()
}

// The wrapper every highlights list shares: its label, its "see all", and the
// rows or the empty line under them.
export function HighlightList({
	label,
	onSeeAll,
	children,
}: {
	label: string
	// Omitted when there's nothing more to see than what's already shown.
	onSeeAll?: () => void
	children: ReactNode
}) {
	return (
		<VStack alignItems="stretch" gap="2">
			{/*
			 * The label and its "see all" sat in the same mono/muted style, so
			 * across a two-column row they ran together into one line of text and
			 * this column's action read as the next column's heading. The label
			 * leads in the body font at full contrast; the action stays small and
			 * quiet beside it.
			 */}
			<HStack justify="space-between" alignItems="baseline" gap="4">
				<h3
					className={css({
						fontSize: "sm",
						fontWeight: "semibold",
						color: "fg.default",
					})}
				>
					{label}
				</h3>
				{onSeeAll && (
					<button
						type="button"
						onClick={onSeeAll}
						className={css({
							flexShrink: "0",
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.subtle",
							cursor: "pointer",
							_hover: { color: "fg.default" },
						})}
					>
						See all →
					</button>
				)}
			</HStack>
			{children}
		</VStack>
	)
}

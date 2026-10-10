import type { StreakMode } from "@called-my-shot/scoring"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { match } from "ts-pattern"
import { Card } from "#/components/ui/card"
import { Identity } from "#/components/ui/identity"
import { Tag } from "#/components/ui/tag"
import type { IdentityData } from "#/lib/identity"

const rowLink = css({
	display: "block",
	textDecoration: "none",
	color: "inherit",
})

type Props = {
	user: IdentityData
	// Omitted for a row that spans the group's leagues, like a Player of the
	// Week award.
	leagueAbbr?: string
	// The track or slate this row is about: "Winners", "Week 3 Sunday Early".
	label: string
	// The headline figure alone - "7", "6 for 6". Big, because across a column
	// of these the number is what people scan.
	value: string
	// What the figure counts, as subtext beneath it - "in a row", "misses in a
	// row". Split off rather than baked into one sentence: as a sentence it was
	// wide enough to collide with the name beside it at card width.
	valueLabel: string
	// The smaller line under it, if there is one.
	note?: string
	// Where the row goes. Optional so a row can render unlinked, though every
	// list passes one today.
	to?: Destination
	// The right rail's layout: identity on its own line, the number beside the
	// label under it. The default puts the number beside the identity, which
	// needs more width than the rail has.
	compact?: boolean
}

// The pages a highlight row can lead to. A union rather than a path
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
	| { kind: "call"; callId: string }

// One member's streak, sweep or record, as the group highlights band, its
// sheet and the Record Book list them. Sized to sit three to a column, so the member and the number
// are what read first and everything else is support.
export function HighlightRow({
	user,
	leagueAbbr,
	label,
	value,
	valueLabel,
	note,
	to,
	compact = false,
}: Props) {
	const identity = (
		<Identity
			name={user.name}
			username={user.username}
			avatarUrl={user.avatarUrl}
			flair={user.flair}
		/>
	)
	const meta = (
		<HStack gap="2" alignItems="center" minWidth="0">
			{leagueAbbr && <Tag size="sm">{leagueAbbr}</Tag>}
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
	)
	const valueLabelText = (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "2xs",
				color: "fg.muted",
				whiteSpace: "nowrap",
			})}
		>
			{valueLabel}
		</span>
	)
	const noteText = note && (
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
	)

	const body = (
		<Card size="sm" interactive={!!to}>
			<Card.Body>
				{compact ? (
					// At rail width the identity needs the whole line to itself, so
					// the number drops to the league line beneath it, beside the
					// label it counts.
					<VStack gap="2" alignItems="stretch">
						{identity}
						<HStack justify="space-between" alignItems="center" gap="3">
							{meta}
							<VStack gap="0" alignItems="flex-end" flexShrink="0">
								<HStack gap="1" alignItems="baseline">
									<span
										className={css({
											fontFamily: "heading",
											fontSize: "lg",
											lineHeight: "1.1",
										})}
									>
										{value}
									</span>
									{valueLabelText}
								</HStack>
								{noteText}
							</VStack>
						</HStack>
					</VStack>
				) : (
					<HStack justify="space-between" alignItems="center" gap="3">
						{/* gap-2, not 1: the flair ends the identity block and the league
						tag starts this one, so two chips would otherwise sit close
						enough to read as one row of tags. */}
						<VStack gap="2" alignItems="flex-start" minWidth="0" flex="1">
							{identity}
							{meta}
						</VStack>
						<VStack gap="0" alignItems="flex-end" flexShrink="0">
							<span
								className={css({
									fontFamily: "heading",
									fontSize: "xl",
									lineHeight: "1.1",
								})}
							>
								{value}
							</span>
							{valueLabelText}
							{noteText}
						</VStack>
					</HStack>
				)}
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
		.with({ kind: "call" }, (d) => (
			<Link
				to="/calls/$callId"
				params={{ callId: d.callId }}
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

import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown } from "react-icons/fi"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { StatTile } from "#/components/ballots/stat-tile"
import { arrowLink } from "#/components/ui/arrow-link"
import { Card } from "#/components/ui/card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatSigned } from "#/lib/format-number"
import { formatRecord } from "#/lib/game-status"
import {
	buildReportCardTweet,
	formatReturn,
	gradeTone,
	isEmptyReportCard,
	reportCardPath,
	reportCardStatusLine,
} from "#/lib/report-card"
import type { ReportCardBonusRowData } from "./report-card-bonus-row"
import { ReportCardBreakdown } from "./report-card-breakdown"
import { ReportCardGameHighlight } from "./report-card-game-highlight"
import { ReportCardHighlight } from "./report-card-highlight"
import type { ReportCardRowData } from "./report-card-row"
import { ReportCardShareRow } from "./report-card-share-row"

// One key for every window, not one per window: folding this away is a
// standing preference about the block, not a judgment about week 3.
const COLLAPSED_KEY = "report-card-collapsed"

export const ReportCardFragment = graphql(`
	fragment ReportCard_card on ReportCard {
		windowKey
		windowLabel
		windowSublabel
		settledCount
		wins
		losses
		pendingCount
		streakBonusPoints
		sweepBonusPoints
		chainBonusPoints
		totalPoints
		committedPoints
		pendingStake
		returnPct
		grade
		isFinal
		league {
			id
			slug
			abbreviation
		}
		byFamily {
			family
			label
			wins
			losses
			pendingCount
			netPoints
			returnPct
		}
		byShape {
			shape
			family
			label
			wins
			losses
			pendingCount
			netPoints
			returnPct
		}
		biggestHit {
			id
			...ReportCardHighlight_call
		}
		biggestMiss {
			id
			...ReportCardHighlight_call
		}
		bestGame {
			...ReportCardGameHighlight_game
		}
		worstGame {
			...ReportCardGameHighlight_game
		}
	}
`)

type Props = {
	card: FragmentType<typeof ReportCardFragment>
	// Set on the permalink, where the breakdown expands to shapes and the
	// header doesn't need to link anywhere.
	expanded?: boolean
	// Whose card this is. Adds the footer: the share row, plus a link to the
	// permalink (or, on the permalink, to the window's games). Omitted when
	// signed out.
	owner?: { id: string; username: string; isOwn: boolean } | null
}

// The viewer's whole day or week, graded. Renders nothing at all for a window
// they have no calls in - the card still comes back from the API in that case
// so the permalink can name the window it found nothing for, but there's
// nothing to show inline.
export function ReportCard({ card: cardProp, expanded, owner }: Props) {
	const card = useFragment(ReportCardFragment, cardProp)
	// Collapsed state is per browser and per surface, not per window - someone
	// who folded this away on Sunday wants it folded on Monday too, and a
	// value that reset on every step of the window stepper would be worse than
	// no control at all. Wrapped because storage throws in a private window.
	const [collapsed, setCollapsed] = useState(() => {
		if (expanded) return false
		try {
			return localStorage.getItem(COLLAPSED_KEY) === "1"
		} catch {
			return false
		}
	})

	if (isEmptyReportCard(card)) return null

	function toggle() {
		const next = !collapsed
		setCollapsed(next)
		try {
			localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0")
		} catch {
			// A viewer with storage blocked just loses the memory of it.
		}
	}

	const statusLine = reportCardStatusLine(card)
	const returnText = formatReturn(card.returnPct)
	const families: (ReportCardRowData & { family: string })[] =
		card.byFamily.map((row) => ({ ...row, family: row.family }))
	const bonuses: ReportCardBonusRowData[] = [
		{ label: "Streak bonus", points: card.streakBonusPoints },
		{ label: "Sweep bonus", points: card.sweepBonusPoints },
		{ label: "Chains", points: card.chainBonusPoints },
	].filter((bonus) => bonus.points !== 0)
	const shapesByFamily = expanded
		? card.byShape.reduce<Record<string, ReportCardRowData[]>>((acc, row) => {
				acc[row.family] = [...(acc[row.family] ?? []), row]
				return acc
			}, {})
		: undefined

	const track = `${card.league.abbreviation.toUpperCase()} · ${card.windowLabel}`
	const tweetTrack = `${card.league.abbreviation.toUpperCase()} ${card.windowLabel}`

	// What this block IS comes first, then which window it covers. Without the
	// title the card is a grade and four numbers with no stated subject.
	const identity = (
		<VStack gap="0" alignItems="flex-start" className={css({ minWidth: "0" })}>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "xs",
					fontWeight: "bold",
					letterSpacing: "wide",
					color: "fg.default",
				})}
			>
				Your Report Card
			</span>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "2xs",
					letterSpacing: "wide",
					color: "fg.muted",
				})}
			>
				{track}
				{card.windowSublabel ? ` · ${card.windowSublabel}` : ""}
			</span>
		</VStack>
	)

	// One size in both states. It sat beside the chevron before, which put the
	// headline number of the whole card in the corner reserved for a control,
	// and shrinking it on collapse made it jump every time the card toggled.
	const gradeMark = card.grade ? (
		<span
			className={css({
				fontFamily: "mono",
				fontSize: "3xl",
				fontWeight: "bold",
				lineHeight: "1",
				flexShrink: "0",
				color: gradeTone(card.grade),
			})}
		>
			{card.grade}
		</span>
	) : null

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					{/* The whole header row is the collapse target - the thing that
					    reopens a folded card should be the easiest element on it
					    to hit. The permalink renders the same header with no
					    control, since there's nothing there to collapse into. */}
					{expanded ? (
						<HStack alignItems="center" gap="4">
							{gradeMark}
							{identity}
						</HStack>
					) : (
						<button
							type="button"
							onClick={toggle}
							aria-expanded={!collapsed}
							aria-label={
								collapsed ? "Show your Report Card" : "Hide your Report Card"
							}
							className={css({
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								gap: "3",
								width: "full",
								minHeight: { base: "44px", sm: "0" },
								cursor: "pointer",
							})}
						>
							<HStack
								gap="4"
								alignItems="center"
								className={css({ minWidth: "0" })}
							>
								{gradeMark}
								{identity}
							</HStack>
							<FiChevronDown
								className={css({
									color: "fg.subtle",
									flexShrink: "0",
									transition: "transform 0.15s ease",
									// Down to open, up to close.
									transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
								})}
							/>
						</button>
					)}

					{collapsed ? null : (
						<>
							<Grid columns={{ base: 2, sm: 4 }} gap="3">
								<StatTile
									value={formatSigned(card.totalPoints, { zeroSign: true })}
									label="NET POINTS"
								/>
								<StatTile
									value={formatRecord(card.wins, card.losses)}
									label="RECORD"
								/>
								<StatTile value={returnText ?? "–"} label="RETURN" />
								<StatTile value={card.committedPoints} label="COMMITTED" />
							</Grid>

							{statusLine && (
								<span
									className={css({
										fontFamily: "mono",
										fontSize: "2xs",
										letterSpacing: "wide",
										color: "fg.subtle",
									})}
								>
									{statusLine}
								</span>
							)}

							<ReportCardBreakdown
								families={families}
								shapesByFamily={shapesByFamily}
								bonuses={bonuses}
							/>

							{(card.biggestHit || card.biggestMiss) && (
								<VStack
									gap="1"
									alignItems="stretch"
									className={css({
										borderTop: "1px solid {colors.border.default}",
										paddingTop: "2",
									})}
								>
									<ReportCardHighlight
										label="Biggest hit"
										call={card.biggestHit}
									/>
									<ReportCardHighlight
										label="Biggest miss"
										call={card.biggestMiss}
									/>
								</VStack>
							)}

							{(card.bestGame || card.worstGame) && (
								<VStack
									gap="1"
									alignItems="stretch"
									className={css({
										borderTop: "1px solid {colors.border.default}",
										paddingTop: "2",
									})}
								>
									<ReportCardGameHighlight
										label="Best game"
										row={card.bestGame}
										username={owner?.username ?? null}
									/>
									<ReportCardGameHighlight
										label="Worst game"
										row={card.worstGame}
										username={owner?.username ?? null}
									/>
								</VStack>
							)}
						</>
					)}
				</VStack>
			</Card.Body>
			{owner && !collapsed && (
				<Card.Footer>
					<HStack justify="space-between" gap="3" width="full">
						{expanded ? (
							<Link
								to="/leagues/$leagueSlug/games"
								params={{ leagueSlug: card.league.slug }}
								search={{ windowKey: card.windowKey }}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								See the games →
							</Link>
						) : (
							<Link
								to={reportCardPath(
									owner.username,
									card.league.slug,
									card.windowKey,
								)}
								className={arrowLink({ tone: "primary", align: "parent" })}
							>
								Open Full Report Card →
							</Link>
						)}
						<ReportCardShareRow
							userId={owner.id}
							username={owner.username}
							leagueSlug={card.league.slug}
							windowKey={card.windowKey}
							shareTitle={`@${owner.username}'s ${tweetTrack} Report Card`}
							tweetText={buildReportCardTweet({
								username: owner.username,
								track: tweetTrack,
								wins: card.wins,
								losses: card.losses,
								totalPoints: card.totalPoints,
								committedPoints: card.committedPoints,
								returnPct: card.returnPct ?? null,
								grade: card.grade ?? null,
								isFinal: card.isFinal,
								isOwn: owner.isOwn,
							})}
						/>
					</HStack>
				</Card.Footer>
			)}
		</Card>
	)
}

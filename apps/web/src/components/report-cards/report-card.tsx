import { questionTitleWithGame } from "@called-my-shot/schemas"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { FiChevronDown } from "react-icons/fi"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { StatTile } from "#/components/ballots/ballot-progress-card"
import {
	ReportCardBreakdown,
	type ReportCardRowData,
} from "#/components/report-cards/report-card-row"
import { ReportCardShareRow } from "#/components/report-cards/report-card-share-row"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { formatRecord, formatSignedPoints } from "#/lib/ballot-entry"
import { pickSummary } from "#/lib/call-summary"
import {
	buildReportCardTweet,
	formatReturn,
	gradeTone,
	isEmptyReportCard,
	reportCardPath,
	reportCardStatusLine,
	returnTone,
} from "#/lib/report-card"
import { buildGameSlug } from "#/lib/slug"

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
		netPoints
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

// What pickSummary needs plus the question's title and matchup. It
// deliberately leaves out the optional margin fields (numericTolerancePct,
// scoredOptions, option.actualValue) - a highlight states the pick, what it
// answered, and the points, and selecting a leader pool's worth of options to render "Josh Allen" would
// be a real cost for no gain. See the comment on CallSummaryData in
// #/lib/call-summary for why those are opt-in.
const HighlightFragment = graphql(`
	fragment ReportCardHighlight_call on Call {
		id
		guessValue
		conviction
		totalPoints
		question {
			id
			title
			shape
			ouLine
			numericActualValue
			numericToleranceAbsolute
			stat {
				id
				toleranceTier {
					toleranceMode
					toleranceValue
				}
			}
			game {
				id
				awayTeam {
					id
					abbreviation
				}
				homeTeam {
					id
					abbreviation
				}
			}
		}
		selections {
			id
			conviction
			option {
				id
				label
				isCorrect
			}
		}
	}
`)

const GameHighlightFragment = graphql(`
	fragment ReportCardGameHighlight_game on ReportCardGame {
		netPoints
		wins
		losses
		game {
			id
			startsAt
			league {
				id
				slug
			}
			homeTeam {
				id
				name
				abbreviation
			}
			awayTeam {
				id
				name
				abbreviation
			}
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

function Highlight({
	label,
	call,
}: {
	label: string
	call: FragmentType<typeof HighlightFragment> | null | undefined
}) {
	const data = useFragment(HighlightFragment, call ?? null)
	if (!data) return null
	return (
		<HStack
			justify="space-between"
			alignItems="baseline"
			gap="3"
			className={css({ paddingY: "1" })}
		>
			<VStack
				gap="0"
				alignItems="flex-start"
				className={css({ minWidth: "0" })}
			>
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				<Link
					to="/calls/$callId"
					params={{ callId: data.id }}
					className={css({
						fontSize: "sm",
						color: "fg.default",
						textDecoration: "none",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						_hover: { textDecoration: "underline" },
					})}
				>
					{pickSummary(data)}
				</Link>
				{/* A bare pick ("Under 0.5") says nothing without the question it
				    answers. */}
				<span
					className={css({
						fontSize: "xs",
						color: "fg.subtle",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						maxWidth: "full",
					})}
				>
					{questionTitleWithGame(data.question.title, data.question.game)}
				</span>
			</VStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
					whiteSpace: "nowrap",
					color: returnTone(data.totalPoints ?? 0),
				})}
			>
				{formatSignedPoints(data.totalPoints ?? 0)}
			</span>
		</HStack>
	)
}

// Opens the owner's picks on that game, which count the same calls this
// record and points do. Falls back to the game itself with no owner to name.
function GameHighlight({
	label,
	row,
	username,
}: {
	label: string
	row: FragmentType<typeof GameHighlightFragment> | null | undefined
	username: string | null
}) {
	const data = useFragment(GameHighlightFragment, row ?? null)
	if (!data) return null
	const { game } = data
	return (
		<HStack
			justify="space-between"
			alignItems="baseline"
			gap="3"
			className={css({ paddingY: "1" })}
		>
			<VStack
				gap="0"
				alignItems="flex-start"
				className={css({ minWidth: "0" })}
			>
				<Eyebrow size="sm" variant="neutral">
					{label}
				</Eyebrow>
				<Link
					{...(username
						? {
								to: "/games/$gameId/picks/$username",
								params: { gameId: game.id, username },
							}
						: {
								to: "/games/$gameId/{-$slug}",
								params: { gameId: game.id, slug: buildGameSlug(game) },
							})}
					className={css({
						fontSize: "sm",
						color: "fg.default",
						textDecoration: "none",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						_hover: { textDecoration: "underline" },
					})}
				>
					{`${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation} · ${formatRecord(data.wins, data.losses)}`}
				</Link>
			</VStack>
			<span
				className={css({
					fontFamily: "mono",
					fontSize: "sm",
					fontWeight: "bold",
					whiteSpace: "nowrap",
					color: returnTone(data.netPoints),
				})}
			>
				{formatSignedPoints(data.netPoints)}
			</span>
		</HStack>
	)
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
					{/* The whole header row is the collapse target, matching
					    QuestionSetStrip - the thing that reopens a folded card
					    should be the easiest element on it to hit. The permalink
					    renders the same header with no control, since there's
					    nothing there to collapse into. */}
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
									// Down to open, up to close - the same rotation
									// QuestionSetStrip uses.
									transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
								})}
							/>
						</button>
					)}

					{collapsed ? null : (
						<>
							<Grid columns={{ base: 2, sm: 4 }} gap="3">
								<StatTile
									value={formatSignedPoints(card.netPoints)}
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
									<Highlight label="Biggest hit" call={card.biggestHit} />
									<Highlight label="Biggest miss" call={card.biggestMiss} />
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
									<GameHighlight
										label="Best game"
										row={card.bestGame}
										username={owner?.username ?? null}
									/>
									<GameHighlight
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
								className={footerLinkClass}
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
								className={footerLinkClass}
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
								netPoints: card.netPoints,
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

const footerLinkClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	letterSpacing: "wide",
	textTransform: "uppercase",
	color: "primary.default",
	textDecoration: "none",
	_hover: { opacity: 0.8 },
})

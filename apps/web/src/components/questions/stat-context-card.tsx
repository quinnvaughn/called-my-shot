import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { Grid, HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { Eyebrow } from "#/components/ui/eyebrow"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { StatContextCard_StatContextFragment } from "#/graphql/generated/graphql"

export const StatContextCardFragment = graphql(`
	fragment StatContextCard_statContext on StatContext {
		statLabel
		lastN
		ranking {
			playerId
			label
			mean
			games
		}
		subjects {
			label
			recentGames {
				gameId
				date
				opponentTeamId
				isHome
				value
				didNotPlay
			}
			seasonToDate {
				games
				mean
				overLine
			}
			home {
				games
				mean
			}
			away {
				games
				mean
			}
			rest {
				medianRestDays
				shortRest {
					games
					mean
				}
				longRest {
					games
					mean
				}
			}
			opponentAllowed {
				teamId
				games
				meanAllowed
				positions
			}
			teamShare {
				sharePct
				games
			}
		}
	}
`)

type Subject = StatContextCard_StatContextFragment["subjects"][number]

// Thresholds are deliberately low. A bar set where a sport's own early season
// can't reach it blanks the card exactly when the little that exists is most
// wanted: in week 2 of an NFL season nobody has three games.
//
// The game strip needs two games to be a strip rather than a restatement of
// the headline.
const MIN_LOG = 2
// "1 of 1" is not a rate. Two is, so that's the floor - the same point every
// other figure here starts averaging at.
const MIN_HIT_RATE = 2
// A split needs two games on each side, or it's just two games relabelled.
const MIN_PER_SIDE = 2

type TeamLabels = Record<string, string>

const mutedClass = css({
	fontFamily: "mono",
	fontSize: "2xs",
	color: "fg.subtle",
	whiteSpace: "nowrap",
})

const numberClass = css({
	fontFamily: "mono",
	fontSize: "sm",
	fontVariantNumeric: "tabular-nums",
})

const tileValueClass = css({
	fontFamily: "heading",
	fontSize: "lg",
	lineHeight: "1.1",
})

const denseTileValueClass = css({
	fontFamily: "heading",
	fontSize: "sm",
	lineHeight: "1.1",
})

const tileLabelClass = css({
	fontFamily: "mono",
	fontSize: "3xs",
	letterSpacing: "wide",
	color: "fg.subtle",
	textTransform: "uppercase",
})

const sectionHeadingClass = css({
	fontFamily: "mono",
	fontSize: "xs",
	letterSpacing: "wide",
	color: "fg.muted",
	textTransform: "uppercase",
})

// A fixed section name so the card is recognisable page to page, with the stat
// as a qualifier on it. The stat appears exactly once, which is what lets every
// label below stay a short inherited qualifier.
function sectionTitle(statLabel: string): string {
	return statLabel ? `The stats \u00b7 ${statLabel}` : "The stats"
}

function round(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// Position codes are written plural when they name a group of players: "WR"
// becomes "WRs". Codes already ending in S ("SS") are left alone.
function plural(position: string): string {
	return position.endsWith("S") ? position : `${position}s`
}

function shortDate(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "numeric",
		day: "numeric",
	})
}

// The number this whole card is about, and the qualifier on it. The stat
// itself is NOT named here - the card's heading says it once, and every label
// under it inherits it. That's what lets these stay short while staying
// generic: "last game" works for receiving yards, hits and rebounds alike,
// where anything self-sufficient would have to name the stat every time.
type Headline = { value: string; label: string }

function headline(subject: Subject): Headline | null {
	const played = subject.recentGames.filter(
		(g) => !g.didNotPlay && g.value !== null,
	)
	if (played.length === 0) return null

	if (played.length === 1) {
		return { value: round(played[0]?.value ?? 0), label: "last game" }
	}
	const mean =
		played.reduce((sum, g) => sum + (g.value ?? 0), 0) / played.length
	return {
		value: round(mean),
		label: `per game, last ${played.length}`,
	}
}

// A horizontal strip rather than a row per game: five numbers side by side
// are scannable, five table rows are a wall.
function GameStrip({
	subject,
	teams,
}: {
	subject: Subject
	teams: TeamLabels
}) {
	if (subject.recentGames.length < MIN_LOG) return null

	return (
		<HStack gap="4" flexWrap="wrap">
			{[...subject.recentGames].reverse().map((game) => {
				const opponent = teams[game.opponentTeamId]
				return (
					<VStack key={game.gameId} gap="0.5" alignItems="flex-start">
						<span className={numberClass}>
							{game.didNotPlay || game.value === null
								? "--"
								: round(game.value)}
						</span>
						<span className={mutedClass}>
							{shortDate(game.date)}
							{opponent ? ` ${game.isHome ? "vs" : "@"} ${opponent}` : ""}
						</span>
					</VStack>
				)
			})}
		</HStack>
	)
}

// A number and what it is, never a sentence. The stat is never named again -
// the headline above already said what these are measured in, and repeating
// "receiving yards" in every row is most of what made the first version
// unreadable.
//
// A thin sample is shown rather than hidden. Only a figure that is genuinely
// meaningless at low n is withheld: a hit rate of 1 of 1 isn't a rate, and a
// home/away split with one game a side is two games relabelled, which the
// strip above already shows.
type Tile = { value: string; label: string }

function supportingTiles(subject: Subject, teams: TeamLabels): Tile[] {
	const tiles: Tile[] = []

	const season = subject.seasonToDate
	if (season && season.games >= MIN_HIT_RATE && season.overLine !== null) {
		tiles.push({
			value: `${season.overLine} of ${season.games}`,
			label: "cleared the line",
		})
	}

	if (
		subject.home &&
		subject.away &&
		subject.home.games >= MIN_PER_SIDE &&
		subject.away.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(subject.home.mean)} / ${round(subject.away.mean)}`,
			label: "home / away",
		})
	}

	const rest = subject.rest
	if (
		rest?.shortRest &&
		rest.longRest &&
		rest.shortRest.games >= MIN_PER_SIDE &&
		rest.longRest.games >= MIN_PER_SIDE
	) {
		tiles.push({
			value: `${round(rest.longRest.mean)} / ${round(rest.shortRest.mean)}`,
			label: `${round(rest.medianRestDays)}+ days rest / less`,
		})
	}

	const share = subject.teamShare
	if (share) {
		tiles.push({
			value: `${round(share.sharePct)}%`,
			label: share.games === 1 ? "of team total, last game" : "of team total",
		})
	}

	const allowed = subject.opponentAllowed
	if (allowed) {
		// Past tense, which agrees with any subject - the earlier "ATL allow"
		// was only broken because the present tense has to agree with a team
		// name. The opposing team IS named here even though the matchup
		// header shows it, because without it the number reads as something
		// the subject's own team gave up. The span is spelled out for the
		// same reason: 124 over one game and 124 a game are different claims.
		const who = teams[allowed.teamId] ?? "opponent"
		const positions = allowed.positions.map(plural).join("/")
		const to = positions ? ` to ${positions}` : ""
		tiles.push({
			value: round(allowed.meanAllowed),
			label:
				allowed.games === 1
					? `${who} allowed${to}, last game`
					: `${who} allowed${to}, per game`,
		})
	}

	return tiles
}

// A pool question's answer is who is in front, so the list is the card. Rank
// on the left, name, then what they average - the number stays right-aligned
// and in the same face as every other figure here so the column scans.
//
// The sample is spelled out per row rather than printed as a bare count: one
// game reads "last game", which is honest about the ordering being a single
// week rather than dressing it up as an average. Early in a season that is
// what every row will say, and saying it is better than implying a season's
// worth of evidence behind the sort.
function Ranking({
	ranking,
}: {
	ranking: StatContextCard_StatContextFragment["ranking"]
}) {
	return (
		<VStack gap="1.5" alignItems="stretch">
			{ranking.map((player, index) => (
				<HStack key={player.playerId} justify="space-between" gap="3">
					<HStack gap="2" minWidth="0">
						<span className={mutedClass}>{index + 1}</span>
						<span
							className={css({
								fontSize: "sm",
								minWidth: "0",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							})}
						>
							{player.label}
						</span>
					</HStack>
					<HStack gap="2" flexShrink="0">
						<span className={numberClass}>{round(player.mean)}</span>
						<span className={mutedClass}>
							{player.games === 1 ? "last game" : `${player.games} games`}
						</span>
					</HStack>
				</HStack>
			))}
		</VStack>
	)
}

function SubjectColumn({
	subject,
	teams,
	maxTiles,
	dense = false,
}: {
	subject: Subject
	teams: TeamLabels
	// Left off where there's room for every tile the recipe produced.
	maxTiles?: number
	// A whole type scale down, for the landing card.
	dense?: boolean
}) {
	const lead = headline(subject)
	const tiles = supportingTiles(subject, teams).slice(0, maxTiles)
	if (!lead && tiles.length === 0) return null

	return (
		<VStack gap={dense ? "2" : "3"} alignItems="stretch" minWidth="0">
			{/* Always named, not just in a head-to-head. On a one-sided card
			    the subject was only implied by the question title further up
			    the page, which leaves a bare "75 / LAST GAME" sitting next to
			    a tile that names a different team entirely. */}
			{subject.label && <Eyebrow size="sm">{subject.label}</Eyebrow>}
			{lead && (
				// Value large in the heading face over a mono micro-label, the
				// same hierarchy the profile stat tiles use.
				<VStack gap="0.5" alignItems="flex-start">
					<span
						className={css({
							fontFamily: "heading",
							fontSize: dense ? "lg" : "3xl",
							lineHeight: "1",
						})}
					>
						{lead.value}
					</span>
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "3xs",
							letterSpacing: "wide",
							color: "fg.subtle",
							textTransform: "uppercase",
						})}
					>
						{lead.label}
					</span>
				</VStack>
			)}
			<GameStrip subject={subject} teams={teams} />
			{tiles.length > 0 && (
				<Grid
					gridTemplateColumns={{
						base: "repeat(2, minmax(0, 1fr))",
						sm: "repeat(auto-fit, minmax(7rem, 1fr))",
					}}
					gap={dense ? "2" : "2.5"}
				>
					{tiles.map((tile) => (
						<VStack key={tile.label} gap="0.5" alignItems="flex-start">
							<span className={dense ? denseTileValueClass : tileValueClass}>
								{tile.value}
							</span>
							<span className={tileLabelClass}>{tile.label}</span>
						</VStack>
					))}
				</Grid>
			)}
		</VStack>
	)
}

export function StatContextCard(props: {
	statContext?: FragmentType<typeof StatContextCardFragment> | null
	teams: TeamLabels
	// Whether the viewer still has a call to make on this question.
	isCallable: boolean
}) {
	// Open while there's still a call to make, since this sits directly above
	// the pick form and reads as input to it. Once the viewer has called (or
	// the question locked), the decision is made and this is reference rather
	// than input, so it starts out of the way and stays one tap from view.
	const [expanded, setExpanded] = useState(props.isCallable)
	const context = useFragment(StatContextCardFragment, props.statContext)

	if (!context) return null

	// Not gated on subjects being present: a pool question deliberately has
	// none, because its ranking stands in for them. The real check is below,
	// once both have been built.
	const ranking = context.ranking
	const columns = context.subjects
		.map((subject) => ({
			subject,
			lead: headline(subject),
			tiles: supportingTiles(subject, props.teams),
		}))
		.filter((column) => column.lead || column.tiles.length > 0)

	// Everything got gated out, so there's nothing worth a card. Renders
	// nothing rather than an empty state, the same as GameStarters.
	if (columns.length === 0 && ranking.length === 0) return null

	const twoUp = columns.length > 1
	// The sat-out note only makes sense next to a strip that can show one.
	const anyStrip = columns.some(
		(column) => column.subject.recentGames.length >= MIN_LOG,
	)

	return (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" alignItems="center">
						<h2 className={sectionHeadingClass}>
							{sectionTitle(context.statLabel)}
						</h2>
						<button
							type="button"
							aria-expanded={expanded}
							onClick={() => setExpanded((open) => !open)}
							className={button({ variant: "ghost", size: "sm" })}
						>
							{expanded ? "Hide" : "Show"}
							{expanded ? <FiChevronUp /> : <FiChevronDown />}
						</button>
					</HStack>

					{expanded && (
						<>
							{ranking.length > 0 && <Ranking ranking={ranking} />}
							<div
								className={css({
									display: "grid",
									gridTemplateColumns: twoUp
										? {
												base: "minmax(0, 1fr)",
												sm: "repeat(2, minmax(0, 1fr))",
											}
										: "minmax(0, 1fr)",
									gap: { base: "5", sm: "6" },
								})}
							>
								{columns.map((column) => (
									<SubjectColumn
										key={column.subject.label}
										subject={column.subject}
										teams={props.teams}
									/>
								))}
							</div>
							<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
								From the box scores we resolve against, up to this game.
								{anyStrip
									? " Games a player sat out show as -- and stay out of every average."
									: ""}
							</p>
						</>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}

// A trimmed run of the same figures, for a surface where the question is an
// invitation rather than a page: the landing page's try-it stack. Same labels
// and the same thresholds, one type scale down, cut to the headline, the games
// behind it and the two tiles that qualify it.
//
// Folded away by default, unlike the card above. There the viewer arrived to
// call a specific question and the numbers are input to a decision already
// being made; here they are one card into meeting the product, and a block of
// splits opening on them pushes the options they are actually being asked to
// tap out of the fold. The line stays visible so the numbers are known to be
// there, which is the part a visitor can't guess.
const HIGHLIGHT_TILES = 2
const HIGHLIGHT_RANKING = 3

export function StatContextHighlights(props: {
	statContext?: FragmentType<typeof StatContextCardFragment> | null
	teams: TeamLabels
}) {
	const [expanded, setExpanded] = useState(false)
	const context = useFragment(StatContextCardFragment, props.statContext)

	if (!context) return null

	const ranking = context.ranking.slice(0, HIGHLIGHT_RANKING)
	const columns = context.subjects.filter(
		(subject) =>
			headline(subject) !== null ||
			supportingTiles(subject, props.teams).length > 0,
	)
	// Nothing to open, so nothing to offer - a toggle that expands to an empty
	// panel is worse than no toggle.
	if (columns.length === 0 && ranking.length === 0) return null

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" alignItems="center">
				<h3 className={sectionHeadingClass}>
					{sectionTitle(context.statLabel)}
				</h3>
				<button
					type="button"
					aria-expanded={expanded}
					onClick={() => setExpanded((open) => !open)}
					className={button({ variant: "ghost", size: "sm" })}
				>
					{expanded ? "Hide" : "Show"}
					{expanded ? <FiChevronUp /> : <FiChevronDown />}
				</button>
			</HStack>
			{expanded && (
				<>
					{ranking.length > 0 && <Ranking ranking={ranking} />}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns:
								columns.length > 1
									? { base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }
									: "minmax(0, 1fr)",
							gap: { base: "3", sm: "4" },
						})}
					>
						{columns.map((subject) => (
							<SubjectColumn
								key={subject.label}
								subject={subject}
								teams={props.teams}
								maxTiles={HIGHLIGHT_TILES}
								dense
							/>
						))}
					</div>
				</>
			)}
		</VStack>
	)
}

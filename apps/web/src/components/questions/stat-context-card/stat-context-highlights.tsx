import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	headline,
	sectionTitle,
	supportingTiles,
	type TeamLabels,
} from "#/lib/stat-context"
import { StatContextCardFragment } from "./fragments"
import { MatchupColumn } from "./matchup-column"
import { MismatchTag } from "./mismatch-tag"
import { Ranking } from "./ranking"
import { SubjectColumn } from "./subject-column"

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
	const matchup = context.matchup
	const columns = context.subjects.filter(
		(subject) =>
			headline(subject) !== null ||
			supportingTiles(subject, props.teams).length > 0,
	)
	// Nothing to open, so nothing to offer - a toggle that expands to an empty
	// panel is worse than no toggle.
	if (!matchup && columns.length === 0 && ranking.length === 0) return null

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" alignItems="center">
				<HStack gap="2" alignItems="center" minWidth="0">
					<h3
						className={css({ textStyle: "sectionHeading", color: "fg.muted" })}
					>
						{sectionTitle(context.statLabel)}
					</h3>
					<MismatchTag show={context.mismatch} />
				</HStack>
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
					{ranking.length > 0 && (
						<Ranking
							ranking={ranking}
							defenses={context.defenses}
							teams={props.teams}
						/>
					)}
					<div
						className={css({
							display: "grid",
							gridTemplateColumns:
								matchup || columns.length > 1
									? { base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }
									: "minmax(0, 1fr)",
							gap: { base: "3", sm: "4" },
						})}
					>
						{/* Head to head is left off here on purpose: it's a third
						    block on a card that has to hold its height inside the
						    fold, and this surface is an invitation rather than
						    research. */}
						{matchup
							? matchup.sides.map((side) => (
									<MatchupColumn
										key={side.teamId}
										side={side}
										focus={matchup.focus}
										maxTiles={HIGHLIGHT_TILES}
										dense
									/>
								))
							: columns.map((subject) => (
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

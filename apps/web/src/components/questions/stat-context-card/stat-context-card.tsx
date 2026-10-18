import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	headline,
	sectionTitle,
	supportingTiles,
	type TeamLabels,
} from "#/lib/stat-context"
import {
	StatContextCardFragment,
	StatContextTrackRecordFragment,
} from "./fragments"
import { MismatchTag } from "./mismatch-tag"
import { StatContextBody } from "./stat-context-body"
import { StatContextSummary } from "./stat-context-summary"
import { TrackRecordStrip } from "./track-record-strip"

export function StatContextCard(props: {
	statContext?: FragmentType<typeof StatContextCardFragment> | null
	trackRecord?: FragmentType<typeof StatContextTrackRecordFragment> | null
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
	const trackRecord = useFragment(
		StatContextTrackRecordFragment,
		props.trackRecord,
	)

	// A season-scoped question has no box-score history to show, but the
	// viewer's own record on the stat still stands on its own.
	const recordOnly = trackRecord ? (
		<Card>
			<Card.Body>
				<TrackRecordStrip record={trackRecord} />
			</Card.Body>
		</Card>
	) : null

	if (!context) return recordOnly

	// Not gated on subjects being present: a pool question deliberately has
	// none, because its ranking stands in for them, and a game-level question
	// has a matchup instead.
	const hasColumns = context.subjects.some(
		(subject) =>
			headline(subject) !== null ||
			supportingTiles(subject, props.teams).length > 0,
	)

	// Everything got gated out, so there's nothing worth a card. Renders
	// nothing rather than an empty state, the same as GameStarters.
	if (!context.matchup && !hasColumns && context.ranking.length === 0) {
		return recordOnly
	}

	const full = (
		<Card>
			<Card.Body>
				<VStack gap="3" alignItems="stretch">
					<HStack justify="space-between" alignItems="center">
						<HStack gap="2" alignItems="center" minWidth="0">
							<h2
								className={css({
									textStyle: "sectionHeading",
									color: "fg.muted",
								})}
							>
								{sectionTitle(context.statLabel)}
							</h2>
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
						<StatContextBody
							context={context}
							trackRecord={trackRecord}
							teams={props.teams}
						/>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)

	// On a phone, while there's a call to make, the folded summary stands in
	// for the card: open, it would sit between the viewer and the options.
	if (!props.isCallable) return full
	return (
		<>
			<div className={css({ display: { base: "block", md: "none" } })}>
				<StatContextSummary
					context={context}
					trackRecord={trackRecord}
					teams={props.teams}
				/>
			</div>
			<div className={css({ display: { base: "none", md: "block" } })}>
				{full}
			</div>
		</>
	)
}

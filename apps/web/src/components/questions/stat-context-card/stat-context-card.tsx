import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { button } from "#/components/ui/button"
import { Card } from "#/components/ui/card"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	headline,
	MIN_LOG,
	sectionTitle,
	supportingTiles,
	type TeamLabels,
} from "#/lib/stat-context"
import {
	StatContextCardFragment,
	StatContextTrackRecordFragment,
} from "./fragments"
import { MatchupColumn } from "./matchup-column"
import { Meetings } from "./meetings"
import { MismatchTag } from "./mismatch-tag"
import { Ranking } from "./ranking"
import { SubjectColumn } from "./subject-column"
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
	// has a matchup instead. The real check is below, once all three have been
	// built.
	const ranking = context.ranking
	const matchup = context.matchup
	const columns = context.subjects
		.map((subject) => ({
			subject,
			lead: headline(subject),
			tiles: supportingTiles(subject, props.teams),
		}))
		.filter((column) => column.lead || column.tiles.length > 0)

	// Everything got gated out, so there's nothing worth a card. Renders
	// nothing rather than an empty state, the same as GameStarters.
	if (!matchup && columns.length === 0 && ranking.length === 0) {
		return recordOnly
	}

	const twoUp = matchup ? true : columns.length > 1
	// The sat-out note only makes sense next to a strip that can show one.
	const anyStrip = columns.some(
		(column) => column.subject.recentGames.length >= MIN_LOG,
	)

	return (
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
									gridTemplateColumns: twoUp
										? {
												base: "minmax(0, 1fr)",
												sm: "repeat(2, minmax(0, 1fr))",
											}
										: "minmax(0, 1fr)",
									gap: { base: "5", sm: "6" },
								})}
							>
								{matchup
									? matchup.sides.map((side) => (
											<MatchupColumn
												key={side.teamId}
												side={side}
												focus={matchup.focus}
											/>
										))
									: columns.map((column) => (
											<SubjectColumn
												key={column.subject.label}
												subject={column.subject}
												teams={props.teams}
											/>
										))}
							</div>
							{matchup && <Meetings matchup={matchup} teams={props.teams} />}
							<p className={css({ fontSize: "xs", color: "fg.subtle" })}>
								{matchup
									? matchup.includesPostseason
										? "Season figures are the regular season only. Last 10, streak, rest, recent results and head to head include the playoffs, up to this game."
										: "Completed regular-season games this season, up to this one. Head to head is this season only."
									: `From the box scores we resolve against, up to this game.${
											anyStrip
												? " Games a player sat out show as -- and stay out of every average."
												: ""
										}`}
							</p>
							{trackRecord && <TrackRecordStrip record={trackRecord} />}
						</>
					)}
				</VStack>
			</Card.Body>
		</Card>
	)
}

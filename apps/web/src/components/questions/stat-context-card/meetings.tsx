import { Fragment } from "react"
import { css, cx } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { formatNumericDate } from "#/lib/format-date"
import {
	type Matchup,
	seriesSummary,
	type TeamLabels,
} from "#/lib/stat-context"
import { mutedClass, numberClass } from "./styles"

export function Meetings({
	matchup,
	teams,
}: {
	matchup: Matchup
	teams: TeamLabels
}) {
	const meetings = matchup.meetings
	if (meetings.length === 0) return null

	const [first, second] = matchup.sides
	const series = first?.headToHead
	// The list is capped, so where it shows fewer than they have played it has
	// to say so - otherwise a 9-2 series reads as five games that don't add up.
	const total = series?.games ?? meetings.length
	const summary = [
		series && first && second
			? seriesSummary(series, first, second, teams)
			: null,
		total > meetings.length ? `last ${meetings.length} of ${total}` : null,
	]
		.filter(Boolean)
		.join(" \u00b7 ")

	return (
		<VStack gap="2" alignItems="stretch">
			<HStack justify="space-between" gap="3" flexWrap="wrap">
				<h3 className={css({ textStyle: "sectionHeading", color: "fg.muted" })}>
					Head to head
				</h3>
				{summary && (
					<span
						className={css({ textStyle: "sectionHeading", color: "fg.muted" })}
					>
						{summary}
					</span>
				)}
			</HStack>
			{/* A column each, so the scores stack under one another instead of
			    landing wherever a three-letter code and a one- or two-digit
			    number happen to leave them. Scores are right-aligned and
			    tabular, which is what puts 10 under 3.

			    One grid for every row rather than a grid per row: that is what
			    makes the columns agree with each other. Aligned columns carry
			    the eye across on their own here, so there are no rules between
			    rows - five short lines don't need ruling off. */}
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: "auto auto auto auto auto",
					columnGap: "2",
					rowGap: "1",
					justifyContent: "start",
					alignItems: "center",
				})}
			>
				{meetings.map((meeting) => (
					<Fragment key={meeting.gameId}>
						<span className={mutedClass}>
							{formatNumericDate(meeting.date)}
						</span>
						<span className={numberClass}>
							{teams[meeting.awayTeamId] ?? ""}
						</span>
						<span className={cx(numberClass, css({ textAlign: "right" }))}>
							{meeting.awayScore}
						</span>
						<span className={mutedClass}>
							{`@ ${teams[meeting.homeTeamId] ?? ""}`}
						</span>
						<span className={cx(numberClass, css({ textAlign: "right" }))}>
							{meeting.homeScore}
						</span>
					</Fragment>
				))}
			</div>
		</VStack>
	)
}

import { css } from "styled-system/css"
import type {
	StatContextCard_StatContextFragment,
	StatContextCard_TrackRecordFragment,
} from "#/graphql/generated/graphql"
import {
	headline,
	MIN_LOG,
	supportingTiles,
	type TeamLabels,
} from "#/lib/stat-context"
import { MatchupColumn } from "./matchup-column"
import { Meetings } from "./meetings"
import { Ranking } from "./ranking"
import { SubjectColumn } from "./subject-column"
import { TrackRecordStrip } from "./track-record-strip"

// Everything under the stats card's heading: the pool's ranking, the two
// columns, the meetings, the note on where the figures come from, and the
// viewer's own record on the stat. The card shows it in place; on a phone it
// opens in a sheet from the folded summary instead (StatContextSheet).
export function StatContextBody({
	context,
	trackRecord,
	teams,
}: {
	context: StatContextCard_StatContextFragment
	trackRecord: StatContextCard_TrackRecordFragment | null | undefined
	teams: TeamLabels
}) {
	const ranking = context.ranking
	const matchup = context.matchup
	const columns = context.subjects.filter(
		(subject) =>
			headline(subject) !== null || supportingTiles(subject, teams).length > 0,
	)
	const twoUp = matchup ? true : columns.length > 1
	// The sat-out note only makes sense next to a strip that can show one.
	const anyStrip = columns.some(
		(subject) => subject.recentGames.length >= MIN_LOG,
	)

	return (
		<>
			{ranking.length > 0 && (
				<Ranking
					ranking={ranking}
					defenses={context.defenses}
					teams={teams}
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
					: columns.map((subject) => (
							<SubjectColumn
								key={subject.label}
								subject={subject}
								teams={teams}
							/>
						))}
			</div>
			{matchup && <Meetings matchup={matchup} teams={teams} />}
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
	)
}

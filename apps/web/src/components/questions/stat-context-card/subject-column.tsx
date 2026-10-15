import { VStack } from "styled-system/jsx"
import { PlayerOrTeamImage } from "#/components/ui/player-or-team-image"
import {
	headline,
	type Subject,
	supportingTiles,
	type TeamLabels,
} from "#/lib/stat-context"
import { ColumnHeading } from "./column-heading"
import { HeadlineBlock } from "./headline-block"
import { RecentGamesStrip } from "./recent-games-strip"
import { TileGrid } from "./tile-grid"

export function SubjectColumn({
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
			{subject.label && (
				<ColumnHeading
					label={subject.label}
					image={
						<PlayerOrTeamImage player={subject.player} team={subject.team} />
					}
				/>
			)}
			<HeadlineBlock lead={lead} dense={dense} />
			<RecentGamesStrip subject={subject} teams={teams} />
			<TileGrid tiles={tiles} dense={dense} />
		</VStack>
	)
}

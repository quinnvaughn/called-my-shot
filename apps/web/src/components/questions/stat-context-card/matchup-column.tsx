import { VStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"
import {
	type Matchup,
	type MatchupSide,
	matchupHeadline,
	matchupTiles,
} from "#/lib/stat-context"
import { ColumnHeading } from "./column-heading"
import { HeadlineBlock } from "./headline-block"
import { ResultStrip } from "./result-strip"
import { TileGrid } from "./tile-grid"

export function MatchupColumn({
	side,
	focus,
	maxTiles,
	dense = false,
}: {
	side: MatchupSide
	focus: Matchup["focus"]
	maxTiles?: number
	dense?: boolean
}) {
	const lead = matchupHeadline(side, focus)
	const tiles = matchupTiles(side, focus).slice(0, maxTiles)

	return (
		<VStack gap={dense ? "2" : "3"} alignItems="stretch" minWidth="0">
			{/* Figures first, results last. The strip is the one block whose
			    height varies with the data, so keeping it at the bottom leaves
			    the two columns' tiles on the same line as each other instead of
			    sliding out of step whenever one side has wrapped to more rows
			    than the other. */}
			{side.label && (
				<ColumnHeading
					label={side.label}
					image={
						side.team && (
							<TeamBadge
								abbreviation={side.team.abbreviation}
								color={side.team.color}
								logoUrl={side.team.logoUrl}
							/>
						)
					}
				/>
			)}
			<HeadlineBlock lead={lead} dense={dense} />
			<TileGrid tiles={tiles} dense={dense} />
			<ResultStrip results={side.recentResults} />
		</VStack>
	)
}

import { css } from "styled-system/css"
import { Tag } from "#/components/ui/tag"
import { SpaceColumnHeader } from "./space-column-header"
import { SpaceSectionList } from "./space-section-list"
import { leagueSections } from "./space-sections"
import type { League } from "./types"

export function LeagueSpaceColumn({ league }: { league: League }) {
	return (
		<div
			className={css({ display: "flex", flexDirection: "column", gap: "4" })}
		>
			<SpaceColumnHeader
				title={league.name}
				subtitle={
					<>
						{league.abbreviation}
						{league.currentSeason?.phase === "POSTSEASON" && (
							<Tag size="sm">Playoffs</Tag>
						)}
					</>
				}
			/>
			<SpaceSectionList sections={leagueSections(league.slug)} />
		</div>
	)
}

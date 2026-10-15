import { css } from "styled-system/css"
import { HStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"

export type SeededTeam = {
	id: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

const seedClass = css({
	textStyle: "meta",
	color: "fg.muted",
})

export function SeededBadge({
	team,
	seed,
}: {
	team: SeededTeam
	seed?: number
}) {
	return (
		<HStack gap="1" alignItems="center">
			{seed !== undefined && <span className={seedClass}>({seed})</span>}
			<TeamBadge
				abbreviation={team.abbreviation}
				color={team.color}
				logoUrl={team.logoUrl}
				showAbbreviation
			/>
		</HStack>
	)
}

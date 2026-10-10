import { HStack } from "styled-system/jsx"
import { TeamBadge } from "#/components/ui/team-badge"

export type FavoriteTeam = {
	id: string
	name: string
	abbreviation: string
	color: string
	logoUrl?: string | null
}

// A user's favorite teams in their listed order, logo and abbreviation each.
// The full name rides along as a tooltip, since a row of ten names wouldn't
// fit beside anything.
export function FavoriteTeamsRow({ teams }: { teams: FavoriteTeam[] }) {
	return (
		<HStack gap="3" alignItems="center" flexWrap="wrap">
			{teams.map((team) => (
				<span key={team.id} title={team.name}>
					<TeamBadge
						abbreviation={team.abbreviation}
						color={team.color}
						logoUrl={team.logoUrl}
						showAbbreviation
					/>
				</span>
			))}
		</HStack>
	)
}

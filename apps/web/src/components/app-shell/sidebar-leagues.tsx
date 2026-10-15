import { SidebarLeagueLink } from "./sidebar-league-link"
import { SidebarSection } from "./sidebar-section"
import type { League } from "./types"

export function SidebarLeagues({
	leagues,
	onNavigate,
}: {
	leagues: League[]
	onNavigate: () => void
}) {
	if (leagues.length === 0) return null

	return (
		<SidebarSection id="leagues" label="LEAGUES">
			{leagues.map((league) => (
				<SidebarLeagueLink
					key={league.id}
					league={league}
					onNavigate={onNavigate}
				/>
			))}
		</SidebarSection>
	)
}

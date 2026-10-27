import { useQuery } from "@tanstack/react-query"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import { watchHubQuery } from "#/graphql/were-you-watching/queries"
import { WatchTeamTile } from "./watch-team-tile"

// The viewer's favorite teams above the full picker, as a shortcut. Nothing
// for a viewer with none, or signed out.
export function WatchYourTeams() {
	const { data } = useQuery(watchHubQuery)
	const entries = data?.watchHub ?? []
	if (entries.length === 0) return null

	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>Your teams</SectionLabel>
			<div
				className={css({
					display: "grid",
					gridTemplateColumns: {
						base: "1fr",
						sm: "1fr 1fr",
						lg: "1fr 1fr 1fr",
					},
					gap: "2",
				})}
			>
				{entries.map((entry) => (
					<WatchTeamTile
						key={entry.team.id}
						entry={entry}
						leagueSlug={entry.league.slug}
					/>
				))}
			</div>
		</VStack>
	)
}

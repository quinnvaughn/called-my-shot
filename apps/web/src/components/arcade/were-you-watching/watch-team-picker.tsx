import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import { SectionLabel } from "#/components/ui/section-label"
import { Tabs } from "#/components/ui/tabs"
import { watchTeamsQuery } from "#/graphql/were-you-watching/queries"
import { WatchTeamTile } from "./watch-team-tile"

export const WATCH_LEAGUES = ["nba", "nfl", "nhl", "mlb"] as const
export type WatchLeagueSlug = (typeof WATCH_LEAGUES)[number]

// Every team, a league at a time, each with the game its quiz is on.
export function WatchTeamPicker({
	initialLeague = "nba",
}: {
	initialLeague?: WatchLeagueSlug
}) {
	const [league, setLeague] = useState<WatchLeagueSlug>(initialLeague)
	const { data, isPending } = useQuery(watchTeamsQuery(league))
	const entries = data?.watchTeams ?? []

	return (
		<VStack gap="3" alignItems="stretch">
			<SectionLabel>Pick your team</SectionLabel>
			<Tabs value={league} onValueChange={setLeague}>
				<Tabs.List variant="pill">
					{WATCH_LEAGUES.map((slug) => (
						<Tabs.Trigger key={slug} value={slug}>
							{slug.toUpperCase()}
						</Tabs.Trigger>
					))}
				</Tabs.List>
			</Tabs>
			<div
				aria-busy={isPending}
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
						leagueSlug={league}
					/>
				))}
			</div>
		</VStack>
	)
}

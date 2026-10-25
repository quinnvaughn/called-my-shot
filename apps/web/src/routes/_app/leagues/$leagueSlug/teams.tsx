import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Grid } from "styled-system/jsx"
import { LeagueTeamTile } from "#/components/leagues/league-team-tile"
import { EmptyState } from "#/components/ui/empty-state"
import { leagueTeamsQuery } from "#/graphql/sports/leagues/queries"
import { pageMeta } from "#/lib/meta"

export const Route = createFileRoute("/_app/leagues/$leagueSlug/teams")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		context.queryClient.query(leagueTeamsQuery(context.league.id)),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Teams · Called My Shot`,
			description: `Every ${league.name} team, each with its own feed and all-time Mount Rushmore.`,
			path: `/leagues/${league.slug}/teams`,
		})
	},
})

function RouteComponent() {
	const { league } = Route.useRouteContext()
	const { data } = useSuspenseQuery(leagueTeamsQuery(league.id))
	const teams = [...(data.league?.teams ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	)

	if (teams.length === 0) {
		return <EmptyState>No teams synced for this league yet.</EmptyState>
	}

	return (
		<Grid gap="3" gridTemplateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }}>
			{teams.map((team) => (
				<LeagueTeamTile key={team.id} leagueSlug={league.slug} team={team} />
			))}
		</Grid>
	)
}

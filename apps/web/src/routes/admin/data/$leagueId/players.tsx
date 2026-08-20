import { useApolloClient, useQuery } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditPlayerModal } from "#/components/admin/data-entity-modal"
import { DataPlayerTable } from "#/components/admin/data-player-table"
import { Button } from "#/components/ui/button"
import type { AdminPlayerSort } from "#/graphql/generated/graphql"
import {
	AdminPlayersDocument,
	AdminTeamOptionsDocument,
} from "#/graphql/queries/admin"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/players")({
	component: RouteComponent,
})

type PlayerRow = {
	id: string
	name: string
	position: string | null
	currentTeam: { id: string; name: string; abbreviation: string } | null
}

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const client = useApolloClient()
	const { data: teamsData } = useQuery(AdminTeamOptionsDocument, {
		variables: { leagueId },
	})
	const teamOptions =
		teamsData?.adminTeams.__typename === "QueryAdminTeamsSuccess"
			? teamsData.adminTeams.data.items
			: []

	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection<PlayerRow, AdminPlayerSort>({
		defaultSort: "NAME",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminPlayersDocument,
				variables: {
					leagueId,
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminPlayers.__typename !== "QueryAdminPlayersSuccess")
				return null
			return data.adminPlayers.data
		},
	})

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() =>
						openModal(
							<AddEditPlayerModal teams={teamOptions} onSaved={reload} />,
						)
					}
				>
					+ Add player
				</Button>
			</HStack>
			<DataPlayerTable
				players={items}
				teams={teamOptions}
				sortBy={sortBy}
				sortDir={sortDir}
				onSort={onSort}
				onSaved={reload}
			/>
			{hasNextPage && (
				<Button
					variant="outline"
					size="sm"
					loading={loading}
					onClick={loadMore}
				>
					Show more →
				</Button>
			)}
		</VStack>
	)
}

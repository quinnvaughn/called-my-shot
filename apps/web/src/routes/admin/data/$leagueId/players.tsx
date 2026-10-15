import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditPlayerModal } from "#/components/admin/data-entity-modal/add-edit-player-modal"
import { DataPlayerTable } from "#/components/admin/data-player-table"
import { Button } from "#/components/ui/button"
import {
	AdminPlayersDocument,
	adminTeamOptionsQuery,
} from "#/graphql/admin/data/queries"
import type { AdminPlayerSort } from "#/graphql/generated/graphql"
import { EMPTY_CONNECTION } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/players")({
	component: RouteComponent,
	loader: ({ context, params }) =>
		context.queryClient.query(adminTeamOptionsQuery(params.leagueId)),
})

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { data: teamsData } = useSuspenseQuery(adminTeamOptionsQuery(leagueId))
	const teamOptions =
		teamsData.adminTeams.__typename === "QueryAdminTeamsSuccess"
			? teamsData.adminTeams.data.items
			: []

	const { items, loading, hasNextPage, sortBy, sortDir, onSort, loadMore } =
		useAdminConnection({
			defaultSort: "NAME" as AdminPlayerSort,
			document: AdminPlayersDocument,
			variables: ({ sortBy, sortDir }) => ({ leagueId, sortBy, sortDir }),
			selectConnection: (data) =>
				data.adminPlayers.__typename === "QueryAdminPlayersSuccess"
					? data.adminPlayers.data
					: EMPTY_CONNECTION,
		})

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() => openModal(<AddEditPlayerModal teams={teamOptions} />)}
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

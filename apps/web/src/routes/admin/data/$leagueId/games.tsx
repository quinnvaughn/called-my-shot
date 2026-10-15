import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditGameModal } from "#/components/admin/data-entity-modal/add-edit-game-modal"
import { DataGameTable } from "#/components/admin/data-game-table"
import { Button } from "#/components/ui/button"
import {
	AdminGamesDocument,
	adminTeamOptionsQuery,
} from "#/graphql/admin/data/queries"
import type { AdminGameSort } from "#/graphql/generated/graphql"
import { EMPTY_CONNECTION } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/games")({
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
			defaultSort: "STARTS_AT" as AdminGameSort,
			defaultDir: "desc",
			document: AdminGamesDocument,
			variables: ({ sortBy, sortDir }) => ({ leagueId, sortBy, sortDir }),
			selectConnection: (data) =>
				data.adminGames.__typename === "QueryAdminGamesSuccess"
					? data.adminGames.data
					: EMPTY_CONNECTION,
		})

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() =>
						openModal(
							<AddEditGameModal leagueId={leagueId} teams={teamOptions} />,
						)
					}
				>
					+ Add game
				</Button>
			</HStack>
			<DataGameTable
				games={items}
				leagueId={leagueId}
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

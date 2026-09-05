import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditGameModal } from "#/components/admin/data-entity-modal"
import { DataGameTable } from "#/components/admin/data-game-table"
import { Button } from "#/components/ui/button"
import type { AdminGameSort } from "#/graphql/generated/graphql"
import {
	AdminGamesDocument,
	AdminTeamOptionsDocument,
} from "#/graphql/queries/admin"
import { EMPTY_CONNECTION, gqlQueryOptions } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/games")({
	component: RouteComponent,
})

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { data: teamsData } = useQuery(
		gqlQueryOptions(AdminTeamOptionsDocument, { leagueId }),
	)
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
	} = useAdminConnection({
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
							<AddEditGameModal
								leagueId={leagueId}
								teams={teamOptions}
								onSaved={reload}
							/>,
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

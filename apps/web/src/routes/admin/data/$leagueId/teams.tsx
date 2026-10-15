import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditTeamModal } from "#/components/admin/data-entity-modal/add-edit-team-modal"
import { DataTeamTable } from "#/components/admin/data-team-table"
import { Button } from "#/components/ui/button"
import { AdminTeamsDocument } from "#/graphql/admin/data/queries"
import type { AdminTeamSort } from "#/graphql/generated/graphql"
import { EMPTY_CONNECTION } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/teams")({
	component: RouteComponent,
})

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { items, loading, hasNextPage, sortBy, sortDir, onSort, loadMore } =
		useAdminConnection({
			defaultSort: "NAME" as AdminTeamSort,
			document: AdminTeamsDocument,
			variables: ({ sortBy, sortDir }) => ({ leagueId, sortBy, sortDir }),
			selectConnection: (data) =>
				data.adminTeams.__typename === "QueryAdminTeamsSuccess"
					? data.adminTeams.data
					: EMPTY_CONNECTION,
		})

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() => openModal(<AddEditTeamModal leagueId={leagueId} />)}
				>
					+ Add team
				</Button>
			</HStack>
			<DataTeamTable
				teams={items}
				leagueId={leagueId}
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

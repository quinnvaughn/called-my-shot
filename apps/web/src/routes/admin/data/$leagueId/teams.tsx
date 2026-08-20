import { useApolloClient } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditTeamModal } from "#/components/admin/data-entity-modal"
import { DataTeamTable } from "#/components/admin/data-team-table"
import { Button } from "#/components/ui/button"
import type { AdminTeamSort } from "#/graphql/generated/graphql"
import { AdminTeamsDocument } from "#/graphql/queries/admin"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/teams")({
	component: RouteComponent,
})

type TeamRow = { id: string; name: string; abbreviation: string; color: string }

function RouteComponent() {
	const { leagueId } = Route.useParams()
	const client = useApolloClient()
	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection<TeamRow, AdminTeamSort>({
		defaultSort: "NAME",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminTeamsDocument,
				variables: {
					leagueId,
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminTeams.__typename !== "QueryAdminTeamsSuccess") return null
			return data.adminTeams.data
		},
	})

	return (
		<VStack gap="3" alignItems="stretch">
			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() =>
						openModal(<AddEditTeamModal leagueId={leagueId} onSaved={reload} />)
					}
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

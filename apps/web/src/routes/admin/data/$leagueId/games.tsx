import { useApolloClient, useQuery } from "@apollo/client/react"
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
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/$leagueId/games")({
	component: RouteComponent,
})

type GameRow = {
	id: string
	startsAt: string
	status: "SCHEDULED" | "LIVE" | "FINAL"
	homeScore: number | null
	awayScore: number | null
	homeTeam: { id: string; name: string; abbreviation: string }
	awayTeam: { id: string; name: string; abbreviation: string }
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
	} = useAdminConnection<GameRow, AdminGameSort>({
		defaultSort: "STARTS_AT",
		defaultDir: "desc",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminGamesDocument,
				variables: {
					leagueId,
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminGames.__typename !== "QueryAdminGamesSuccess") return null
			return data.adminGames.data
		},
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

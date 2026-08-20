import { useApolloClient, useQuery } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { HStack, VStack } from "styled-system/jsx"
import { AddEditLeagueModal } from "#/components/admin/data-entity-modal"
import { DataLeagueTable } from "#/components/admin/data-league-table"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import type { AdminLeagueSort } from "#/graphql/generated/graphql"
import {
	AdminLeaguesDocument,
	SportsForAdminDocument,
} from "#/graphql/queries/admin"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/")({
	component: RouteComponent,
})

type LeagueRow = {
	id: string
	name: string
	abbreviation: string
	slug: string
	status: string
	sport: { id: string; name: string }
}

function RouteComponent() {
	const client = useApolloClient()
	const { data: sportsData } = useQuery(SportsForAdminDocument)
	const sports = sportsData?.sports ?? []

	const {
		items,
		loading,
		hasNextPage,
		sortBy,
		sortDir,
		onSort,
		loadMore,
		reload,
	} = useAdminConnection<LeagueRow, AdminLeagueSort>({
		defaultSort: "NAME",
		fetchPage: async ({ sortBy: sb, sortDir: sd, after }) => {
			const { data } = await client.query({
				query: AdminLeaguesDocument,
				variables: {
					sortBy: sb,
					sortDir: sd === "asc" ? "ASC" : "DESC",
					after,
				},
				fetchPolicy: "network-only",
			})
			if (data?.adminLeagues.__typename !== "QueryAdminLeaguesSuccess")
				return null
			return data.adminLeagues.data
		},
	})

	return (
		<VStack gap="6" alignItems="stretch">
			<PageHeader title="Data" subtitle="Leagues, teams, players, and games." />

			<HStack justify="flex-end">
				<Button
					variant="solid"
					onClick={() =>
						openModal(<AddEditLeagueModal sports={sports} onSaved={reload} />)
					}
				>
					+ Add league
				</Button>
			</HStack>

			<DataLeagueTable
				leagues={items}
				sports={sports}
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

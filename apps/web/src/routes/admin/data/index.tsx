import { useQuery } from "@tanstack/react-query"
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
import { EMPTY_CONNECTION, gqlQueryOptions } from "#/graphql/query-options"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/data/")({
	component: RouteComponent,
})

function RouteComponent() {
	const { data: sportsData } = useQuery(
		gqlQueryOptions(SportsForAdminDocument, {}),
	)
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
	} = useAdminConnection({
		defaultSort: "NAME" as AdminLeagueSort,
		document: AdminLeaguesDocument,
		variables: ({ sortBy, sortDir }) => ({ sortBy, sortDir }),
		selectConnection: (data) =>
			data.adminLeagues.__typename === "QueryAdminLeaguesSuccess"
				? data.adminLeagues.data
				: EMPTY_CONNECTION,
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

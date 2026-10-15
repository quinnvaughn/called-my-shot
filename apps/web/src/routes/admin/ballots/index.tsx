import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { HStack, VStack } from "styled-system/jsx"
import {
	AdminBallotsFilters,
	ALL_LEAGUES,
} from "#/components/admin/admin-ballots-filters"
import { AdminBallotsTable } from "#/components/admin/admin-ballots-table"
import { NewBallotModal } from "#/components/admin/new-ballot-modal"
import { Button } from "#/components/ui/button"
import { PageHeader } from "#/components/ui/page-header"
import { AdminBallotsDocument } from "#/graphql/ballots/queries"
import type { AdminBallotSort, BallotStatus } from "#/graphql/generated/graphql"
import { EMPTY_CONNECTION, gqlQueryOptions } from "#/graphql/query-options"
import {
	AdminBallotScopeDocument,
	SportsDocument,
} from "#/graphql/sports/catalog/queries"
import { useAdminConnection } from "#/hooks/use-admin-connection"
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { openModal } from "#/stores/modal-store"

export const Route = createFileRoute("/admin/ballots/")({
	component: RouteComponent,
})

function RouteComponent() {
	const [search, setSearch] = useState("")
	const [status, setStatus] = useState<BallotStatus | null>(null)
	const [leagueId, setLeagueId] = useState(ALL_LEAGUES)
	const [pickedSeasonId, setPickedSeasonId] = useState<string | null>(null)
	const debouncedSearch = useDebouncedValue(search, 300)

	const { data: sportsData } = useQuery(gqlQueryOptions(SportsDocument, {}))

	const { data: scopeData } = useQuery(
		gqlQueryOptions(
			AdminBallotScopeDocument,
			{ leagueId },
			{ enabled: !!leagueId },
		),
	)
	const seasons = useMemo(
		() => scopeData?.leagueSeasons ?? [],
		[scopeData],
	)

	// The picked season while it belongs to the league on screen, otherwise
	// the league's current season rather than its newest, which aren't the
	// same thing (the sync carries this year and next). A season from the
	// league you just left won't be in the new list, so it falls back instead
	// of silently filtering to nothing.
	const seasonId = !leagueId
		? null
		: pickedSeasonId && seasons.some((season) => season.id === pickedSeasonId)
			? pickedSeasonId
			: (scopeData?.currentSeason?.id ?? seasons[0]?.id ?? null)

	// Reordering only means anything within one league and season - that pair is
	// the scope ballots.sortOrder is positional in - so the list only becomes
	// the sortable thing once both are picked. Anything less stays the ordinary
	// searchable, paginated table.
	const isOrdering = Boolean(leagueId && seasonId)

	const { items, loading, hasNextPage, sortBy, sortDir, onSort, loadMore } =
		useAdminConnection({
			defaultSort: "NAME" as AdminBallotSort,
			document: AdminBallotsDocument,
			variables: ({ sortBy, sortDir }) => ({
				search: debouncedSearch || undefined,
				status: status ?? undefined,
				leagueId: leagueId || undefined,
				// Ordering mode ignores the hook's own sort state and pages in one
				// go: a position you can only see one page of isn't a position you
				// can move a ballot to.
				seasonId: isOrdering ? (seasonId ?? undefined) : undefined,
				sortBy: isOrdering ? "SORT_ORDER" : sortBy,
				sortDir: isOrdering ? "ASC" : sortDir,
				first: isOrdering ? 100 : undefined,
			}),
			selectConnection: (data) =>
				data.adminBallots.__typename === "QueryAdminBallotsSuccess"
					? data.adminBallots.data
					: EMPTY_CONNECTION,
		})

	return (
		<VStack gap="6" alignItems="stretch">
			<HStack justify="space-between" alignItems="flex-start" gap="4">
				<PageHeader
					title="Ballots"
					subtitle="Award ballots, a week of games - a set of questions people answer at their own pace."
				/>
				<Button
					variant="solid"
					size="sm"
					onClick={() => openModal(<NewBallotModal />)}
				>
					+ New ballot
				</Button>
			</HStack>
			<AdminBallotsFilters
				search={search}
				onSearchChange={setSearch}
				sports={sportsData?.sports}
				leagueId={leagueId}
				onLeagueChange={(next) => {
					// A new league starts from its own current season.
					if (next !== leagueId) setPickedSeasonId(null)
					setLeagueId(next)
				}}
				seasons={seasons}
				seasonId={seasonId}
				onSeasonChange={setPickedSeasonId}
				status={status}
				onStatusChange={setStatus}
			/>

			<AdminBallotsTable
				items={items}
				loading={loading}
				isOrdering={isOrdering}
				leagueId={leagueId}
				seasonId={seasonId}
				sortBy={sortBy}
				sortDir={sortDir}
				onSort={onSort}
			/>

			{hasNextPage && !isOrdering && (
				<Button variant="outline" size="sm" loading={loading} onClick={loadMore}>
					Show more →
				</Button>
			)}
		</VStack>
	)
}

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useFragment } from "#/graphql/generated"
import {
	LeaderboardEntryFragment,
	leaderboardQuery,
} from "#/graphql/queries/leaderboard"
import { type IdentityUser, toIdentity } from "#/lib/identity"
import type {
	FilterLeague,
	LeaderboardFilter,
	LeaderboardSearch,
} from "#/lib/leaderboard-filter"
import { Leaderboard, type LeaderboardRowData } from "./leaderboard"
import { LeaderboardFilters } from "./leaderboard-filters"

type SiteLeaderboardProps = {
	leagues: FilterLeague[]
	filter: LeaderboardFilter
	onFilterChange: (search: LeaderboardSearch) => void
	viewerId?: string
}

type LeaderboardEntryData = {
	rank: number | null
	totalPoints: number
	resolvedCallCount: number
	accuracy: number | null
	user: IdentityUser
}

function toRowData(entry: LeaderboardEntryData): LeaderboardRowData {
	return {
		rank: entry.rank,
		totalPoints: entry.totalPoints,
		resolvedCallCount: entry.resolvedCallCount,
		accuracy: entry.accuracy,
		user: toIdentity(entry.user),
	}
}

// Same shape as GroupLeaderboard (components/groups/group-leaderboard.tsx):
// changing either filter replaces the page entirely (a new scope is a whole
// new ranking, not more of the same one), "show more" appends. The filter
// lives in the URL rather than in state here, so a filtered board is
// shareable and survives a refresh - see routes/_app/leaderboard.tsx.
export function SiteLeaderboard({
	leagues,
	filter,
	onFilterChange,
	viewerId,
}: SiteLeaderboardProps) {
	// Both filters are part of the key, so changing either starts a fresh
	// ranking rather than appending to the previous one - no manual reset.
	// keepPreviousData holds the outgoing scope's rows in place while the new
	// one loads, instead of collapsing the list to empty mid-switch.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...leaderboardQuery(filter.leagueId, filter.season),
		placeholderData: keepPreviousData,
	})
	const items = data?.items ?? []
	const viewerEntry = data?.pages[0]?.viewerLeaderboardEntry ?? null

	const unwrappedItems = useFragment(LeaderboardEntryFragment, items)
	const rows = unwrappedItems.map(toRowData)
	const unwrappedViewerEntry = useFragment(
		LeaderboardEntryFragment,
		viewerEntry,
	)
	const viewerRow = unwrappedViewerEntry
		? toRowData(unwrappedViewerEntry)
		: null

	return (
		<>
			<LeaderboardFilters
				leagues={leagues}
				filter={filter}
				onChange={onFilterChange}
			/>
			<Leaderboard
				items={rows}
				viewerId={viewerId}
				viewerEntry={viewerRow}
				hasMore={hasNextPage}
				loading={isFetching}
				onLoadMore={fetchNextPage}
				emptyMessage={`No resolved calls yet. ${filter.scopeLabel}.`}
			/>
		</>
	)
}

import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { graphql, useFragment } from "#/graphql/generated"
import type { SeasonFilterInput } from "#/graphql/generated/graphql"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"
import type {
	FilterLeague,
	LeaderboardFilter,
	LeaderboardSearch,
} from "#/lib/leaderboard-filter"
import {
	Leaderboard,
	type LeaderboardRowData,
} from "../leaderboard/leaderboard"
import { LeaderboardFilters } from "../leaderboard/leaderboard-filters"

export const GroupLeaderboardEntryFragment = graphql(`
	fragment GroupLeaderboard_entry on GroupLeaderboardEntry {
		rank
		role
		totalPoints
		accuracy
		resolvedCallCount
		user {
			id
			name
			username
		}
	}
`)

// Standalone from GroupDetailDocument - the filters and the "show more"
// button both need to refetch this connection (and the viewer's own row,
// which moves with the scope too) on their own without touching the rest
// of the group page.
export const GroupLeaderboardDocument = graphql(`
	query GroupLeaderboard(
		$groupId: ID!
		$leagueId: ID
		$season: SeasonFilterInput
		$after: String
	) {
		group(id: $groupId) {
			id
			leaderboard(
				first: 10
				leagueId: $leagueId
				season: $season
				after: $after
			) {
				items {
					rank
					user {
						id
					}
					...GroupLeaderboard_entry
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
			viewerLeaderboardEntry(leagueId: $leagueId, season: $season) {
				...GroupLeaderboard_entry
			}
		}
	}
`)

export const groupLeaderboardQuery = (
	groupId: string,
	leagueId: string | null,
	season: SeasonFilterInput,
) =>
	gqlInfiniteQueryOptions(
		GroupLeaderboardDocument,
		{ groupId, leagueId, season },
		(data) => data.group?.leaderboard ?? EMPTY_CONNECTION,
	)

type GroupLeaderboardProps = {
	groupId: string
	leagues: FilterLeague[]
	filter: LeaderboardFilter
	onFilterChange: (search: LeaderboardSearch) => void
	viewerId?: string
}

function toRowData(entry: {
	rank: number
	role: "ADMIN" | "MEMBER"
	totalPoints: number
	resolvedCallCount: number
	accuracy: number | null
	user: { id: string; name: string; username: string }
}): LeaderboardRowData {
	return {
		rank: entry.rank,
		totalPoints: entry.totalPoints,
		resolvedCallCount: entry.resolvedCallCount,
		accuracy: entry.accuracy,
		role: entry.role,
		user: entry.user,
	}
}

// Rank-only pagination (see buildLeaderboard/leaderboard on GroupRef): a
// "show more" button, not infinite scroll - most groups are small enough
// that nobody needs the whole roster loaded by default. Changing either
// filter replaces the page entirely rather than appending, since a new scope
// means a whole new ranking, not more of the same one.
export function GroupLeaderboard({
	groupId,
	leagues,
	filter,
	onFilterChange,
	viewerId,
}: GroupLeaderboardProps) {
	const [collapsed, setCollapsed] = useState(false)

	// Both filters are part of the key, so changing either starts a fresh
	// ranking rather than appending to the previous one - no manual reset.
	// keepPreviousData holds the outgoing scope's rows in place while the
	// new one loads, instead of collapsing the list to empty mid-switch.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...groupLeaderboardQuery(groupId, filter.leagueId, filter.season),
		placeholderData: keepPreviousData,
	})
	const items = data?.items ?? []
	const viewerEntry = data?.pages[0]?.group?.viewerLeaderboardEntry ?? null

	const unwrappedItems = useFragment(GroupLeaderboardEntryFragment, items)
	const rows = unwrappedItems.map(toRowData)
	const unwrappedViewerEntry = useFragment(
		GroupLeaderboardEntryFragment,
		viewerEntry,
	)
	const viewerRow = unwrappedViewerEntry
		? toRowData(unwrappedViewerEntry)
		: null

	return (
		<VStack alignItems="stretch" gap="3">
			<HStack justify="space-between" alignItems="center">
				<h2
					className={css({
						fontFamily: "mono",
						fontSize: "xs",
						letterSpacing: "wide",
						color: "fg.muted",
						textTransform: "uppercase",
					})}
				>
					Leaderboard
				</h2>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setCollapsed((c) => !c)}
				>
					{collapsed ? <FiChevronDown /> : <FiChevronUp />}
					{collapsed ? "Show" : "Hide"}
				</Button>
			</HStack>
			{!collapsed && (
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
						emptyMessage={`No calls yet. ${filter.scopeLabel}.`}
					/>
				</>
			)}
		</VStack>
	)
}

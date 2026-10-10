import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { VStack } from "styled-system/jsx"
import { graphql, useFragment } from "#/graphql/generated"
import type { SeasonFilterInput } from "#/graphql/generated/graphql"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"
import { formatShortDate } from "#/lib/format-date"
import { type IdentityUser, toIdentity } from "#/lib/identity"
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
		totalPoints
		accuracy
		resolvedCallCount
		user {
			...Identity_user
		}
	}
`)

export const GroupLeaderboardUnsettledFragment = graphql(`
	fragment GroupLeaderboard_unsettled on UnsettledCalls {
		count
		nextGame {
			id
			startsAt
			homeTeam {
				id
				abbreviation
			}
			awayTeam {
				id
				abbreviation
			}
		}
	}
`)

// What the viewer's card says while they're unranked: when their first
// result is due, from the soonest game behind an unsettled call, or failing
// that how many are waiting.
function unrankedLabel(unsettled: {
	count: number
	nextGame: {
		startsAt: string
		homeTeam: { abbreviation: string }
		awayTeam: { abbreviation: string }
	} | null
}): string {
	const { count, nextGame } = unsettled
	if (count === 0) return "Make a call to get ranked"
	if (nextGame) {
		return `First result after ${nextGame.awayTeam.abbreviation} @ ${nextGame.homeTeam.abbreviation} · ${formatShortDate(nextGame.startsAt)}`
	}
	return count === 1
		? "Ranked once your call settles"
		: `Ranked once one of your ${count} calls settles`
}

// The Leaderboard tab's own query - the filters and the "show more" button
// both need to refetch this connection (and the viewer's own row, which
// moves with the scope too) on their own without touching the group's
// header.
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
			viewerUnsettledCalls(leagueId: $leagueId, season: $season) {
				...GroupLeaderboard_unsettled
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
	rank: number | null
	totalPoints: number
	resolvedCallCount: number
	accuracy: number | null
	user: IdentityUser
}): LeaderboardRowData {
	return {
		rank: entry.rank,
		totalPoints: entry.totalPoints,
		resolvedCallCount: entry.resolvedCallCount,
		accuracy: entry.accuracy,
		user: toIdentity(entry.user),
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
	const unsettled = useFragment(
		GroupLeaderboardUnsettledFragment,
		data?.pages[0]?.group?.viewerUnsettledCalls ?? null,
	)

	return (
		<VStack alignItems="stretch" gap="3">
			<LeaderboardFilters
				leagues={leagues}
				filter={filter}
				onChange={onFilterChange}
			/>
			<Leaderboard
				items={rows}
				viewerId={viewerId}
				viewerEntry={viewerRow}
				viewerUnrankedLabel={unsettled ? unrankedLabel(unsettled) : undefined}
				hasMore={hasNextPage}
				loading={isFetching}
				onLoadMore={fetchNextPage}
				emptyMessage={`No resolved calls yet. ${filter.scopeLabel}.`}
			/>
		</VStack>
	)
}

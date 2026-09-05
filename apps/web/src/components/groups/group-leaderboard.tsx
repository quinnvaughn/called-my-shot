import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Button } from "#/components/ui/button"
import { Tabs } from "#/components/ui/tabs"
import { graphql, useFragment } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"
import {
	Leaderboard,
	type LeaderboardRowData,
} from "../leaderboard/leaderboard"

export const GroupLeaderboardEntryFragment = graphql(`
	fragment GroupLeaderboard_entry on GroupLeaderboardEntry {
		rank
		role
		totalPoints
		accuracy
		callCount
		resolvedCallCount
		user {
			id
			name
			username
		}
	}
`)

// Standalone from GroupDetailDocument - the league tabs and "show more"
// button both need to refetch this connection (and the viewer's own row,
// which moves with the league too) on their own without touching the rest
// of the group page.
export const GroupLeaderboardDocument = graphql(`
	query GroupLeaderboard($groupId: ID!, $leagueId: ID, $after: String) {
		group(id: $groupId) {
			id
			leaderboard(first: 10, leagueId: $leagueId, after: $after) {
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
			viewerLeaderboardEntry(leagueId: $leagueId) {
				...GroupLeaderboard_entry
			}
		}
	}
`)

export const groupLeaderboardQuery = (
	groupId: string,
	leagueId: string | null,
) =>
	gqlInfiniteQueryOptions(
		GroupLeaderboardDocument,
		{ groupId, leagueId },
		(data) => data.group?.leaderboard ?? EMPTY_CONNECTION,
	)

// League, not sport - NBA and NCAAB shouldn't rank against each other even
// though both are basketball.
type League = { id: string; name: string; abbreviation: string; slug: string }

type GroupLeaderboardProps = {
	groupId: string
	leagues: League[]
	viewerId?: string
}

function toRowData(entry: {
	rank: number
	role: "ADMIN" | "MEMBER"
	totalPoints: number
	callCount: number
	accuracy: number | null
	user: { id: string; name: string; username: string }
}): LeaderboardRowData {
	return {
		rank: entry.rank,
		totalPoints: entry.totalPoints,
		callCount: entry.callCount,
		accuracy: entry.accuracy,
		role: entry.role,
		user: entry.user,
	}
}

// Rank-only pagination (see buildLeaderboard/leaderboard on GroupRef): a
// "show more" button, not infinite scroll - most groups are small enough
// that nobody needs the whole roster loaded by default. Switching leagues
// replaces the page entirely rather than appending, since a new league
// means a whole new ranking, not more of the same one.
export function GroupLeaderboard({
	groupId,
	leagues,
	viewerId,
}: GroupLeaderboardProps) {
	const [collapsed, setCollapsed] = useState(false)
	const [leagueId, setLeagueId] = useState<string | null>(null)

	// leagueId is part of the key, so switching leagues starts a fresh
	// ranking rather than appending to the previous one - no manual reset.
	// keepPreviousData holds the outgoing league's rows in place while the
	// new one loads, instead of collapsing the list to empty mid-switch.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...groupLeaderboardQuery(groupId, leagueId),
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
					{leagues.length > 0 && (
						<Tabs
							value={leagueId ?? "all"}
							onValueChange={(v) => setLeagueId(v === "all" ? null : v)}
						>
							<Tabs.List>
								<Tabs.Trigger value="all">All</Tabs.Trigger>
								{leagues.map((league) => (
									<Tabs.Trigger key={league.id} value={league.id}>
										{league.abbreviation}
									</Tabs.Trigger>
								))}
							</Tabs.List>
						</Tabs>
					)}
					<Leaderboard
						items={rows}
						viewerId={viewerId}
						viewerEntry={viewerRow}
						hasMore={hasNextPage}
						loading={isFetching}
						onLoadMore={fetchNextPage}
					/>
				</>
			)}
		</VStack>
	)
}

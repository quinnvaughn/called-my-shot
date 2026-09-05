import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Tabs } from "#/components/ui/tabs"
import { useFragment } from "#/graphql/generated"
import {
	LeaderboardEntryFragment,
	leaderboardQuery,
} from "#/graphql/queries/leaderboard"
import { Leaderboard, type LeaderboardRowData } from "./leaderboard"

// League, not sport - NBA and NCAAB shouldn't rank against each other even
// though both are basketball.
type League = { id: string; name: string; abbreviation: string; slug: string }

type SiteLeaderboardProps = {
	leagues: League[]
	viewerId?: string
}

function toRowData(entry: {
	rank: number
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
		user: entry.user,
	}
}

// Same shape as GroupLeaderboard (components/groups/group-leaderboard.tsx):
// league tabs replace the page entirely on switch (a new league is a whole
// new ranking, not more of the same one), "show more" appends.
export function SiteLeaderboard({ leagues, viewerId }: SiteLeaderboardProps) {
	const [leagueId, setLeagueId] = useState<string | null>(null)

	// leagueId is part of the key, so switching leagues starts a fresh
	// ranking rather than appending to the previous one - no manual reset.
	// keepPreviousData holds the outgoing league's rows in place while the
	// new one loads, instead of collapsing the list to empty mid-switch.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...leaderboardQuery(leagueId),
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
	)
}

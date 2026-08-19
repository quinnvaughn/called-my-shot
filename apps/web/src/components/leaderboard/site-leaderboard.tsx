import { useApolloClient } from "@apollo/client/react"
import { useEffect, useRef, useState } from "react"
import { Tabs } from "#/components/ui/tabs"
import { type FragmentType, useFragment } from "#/graphql/generated"
import {
	LeaderboardDocument,
	LeaderboardEntryFragment,
} from "#/graphql/queries/leaderboard"
import { Leaderboard, type LeaderboardRowData } from "./leaderboard"

type LeaderboardEntryItem = {
	rank: number
	user: { id: string }
} & FragmentType<typeof LeaderboardEntryFragment>

type ViewerEntryItem = FragmentType<typeof LeaderboardEntryFragment>

type PageInfo = { hasNextPage: boolean; endCursor: string | null }

// League, not sport - NBA and NCAAB shouldn't rank against each other even
// though both are basketball.
type League = { id: string; name: string; abbreviation: string; slug: string }

type SiteLeaderboardProps = {
	initialItems: LeaderboardEntryItem[]
	initialPageInfo: PageInfo
	initialViewerEntry?: ViewerEntryItem | null
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
export function SiteLeaderboard({
	initialItems,
	initialPageInfo,
	initialViewerEntry,
	leagues,
	viewerId,
}: SiteLeaderboardProps) {
	const client = useApolloClient()
	const [leagueId, setLeagueId] = useState<string | null>(null)
	const [items, setItems] = useState(initialItems)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
	const [viewerEntry, setViewerEntry] = useState(initialViewerEntry ?? null)
	const [loading, setLoading] = useState(false)
	const skipNextFetch = useRef(true)

	useEffect(() => {
		if (skipNextFetch.current) {
			skipNextFetch.current = false
			return
		}
		let cancelled = false
		setLoading(true)
		client
			.query({
				query: LeaderboardDocument,
				variables: { leagueId, after: null },
				fetchPolicy: "network-only",
			})
			.then(({ data }) => {
				if (cancelled) return
				setItems(data?.leaderboard.items ?? [])
				setPageInfo(
					data?.leaderboard.pageInfo ?? { hasNextPage: false, endCursor: null },
				)
				setViewerEntry(data?.viewerLeaderboardEntry ?? null)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [client, leagueId])

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: LeaderboardDocument,
				variables: { leagueId, after: pageInfo.endCursor },
				fetchPolicy: "network-only",
			})
			setItems((prev) => [...prev, ...(data?.leaderboard.items ?? [])])
			setPageInfo(
				data?.leaderboard.pageInfo ?? { hasNextPage: false, endCursor: null },
			)
		} finally {
			setLoading(false)
		}
	}

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
				hasMore={pageInfo.hasNextPage}
				loading={loading}
				onLoadMore={loadMore}
			/>
		</>
	)
}

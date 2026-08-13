import { useApolloClient } from "@apollo/client/react"
import { useEffect, useRef, useState } from "react"
import { FiChevronDown, FiChevronUp } from "react-icons/fi"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import { Avatar } from "#/components/ui/avatar"
import { Button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { Table } from "#/components/ui/table"
import { Tabs } from "#/components/ui/tabs"
import { Tag } from "#/components/ui/tag"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

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
// button both need to refetch this connection on their own (new league,
// next page) without touching the rest of the group page.
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
		}
	}
`)

type LeaderboardEntryItem = {
	rank: number
	user: { id: string }
} & FragmentType<typeof GroupLeaderboardEntryFragment>

type PageInfo = { hasNextPage: boolean; endCursor: string | null }

// League, not sport - NBA and NCAAB shouldn't rank against each other even
// though both are basketball.
type League = { id: string; name: string; abbreviation: string; slug: string }

type GroupLeaderboardProps = {
	groupId: string
	initialItems: LeaderboardEntryItem[]
	initialPageInfo: PageInfo
	leagues: League[]
	viewerId?: string
}

// Rank-only pagination (see buildLeaderboard/leaderboard on GroupRef): a
// "show more" button, not infinite scroll - most groups are small enough
// that nobody needs the whole roster loaded by default. Switching leagues
// replaces the page entirely rather than appending, since a new league
// means a whole new ranking, not more of the same one.
export function GroupLeaderboard({
	groupId,
	initialItems,
	initialPageInfo,
	leagues,
	viewerId,
}: GroupLeaderboardProps) {
	const client = useApolloClient()
	const [collapsed, setCollapsed] = useState(false)
	const [leagueId, setLeagueId] = useState<string | null>(null)
	const [items, setItems] = useState(initialItems)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
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
				query: GroupLeaderboardDocument,
				variables: { groupId, leagueId, after: null },
				fetchPolicy: "network-only",
			})
			.then(({ data }) => {
				if (cancelled) return
				setItems(data?.group?.leaderboard.items ?? [])
				setPageInfo(
					data?.group?.leaderboard.pageInfo ?? {
						hasNextPage: false,
						endCursor: null,
					},
				)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [client, groupId, leagueId])

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: GroupLeaderboardDocument,
				variables: { groupId, leagueId, after: pageInfo.endCursor },
				fetchPolicy: "network-only",
			})
			setItems((prev) => [...prev, ...(data?.group?.leaderboard.items ?? [])])
			setPageInfo(
				data?.group?.leaderboard.pageInfo ?? {
					hasNextPage: false,
					endCursor: null,
				},
			)
		} finally {
			setLoading(false)
		}
	}

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
					{items.length === 0 && !loading ? (
						<EmptyState>No calls yet.</EmptyState>
					) : (
						<Table sortBy="rank" sortDir="desc">
							<Table.Head
								columns={[
									{ key: "rank", label: "#", numeric: true, width: "56px" },
									{ key: "member", label: "Member" },
									{
										key: "points",
										label: "Points",
										numeric: true,
										width: "120px",
									},
								]}
							/>
							<Table.Body>
								{items.map((item) => (
									<LeaderboardRow
										key={item.user.id}
										item={item}
										viewerId={viewerId}
									/>
								))}
							</Table.Body>
						</Table>
					)}
					{pageInfo.hasNextPage && (
						<Button
							variant="outline"
							size="sm"
							loading={loading}
							onClick={loadMore}
						>
							Show more →
						</Button>
					)}
				</>
			)}
		</VStack>
	)
}

function LeaderboardRow({
	item,
	viewerId,
}: {
	item: LeaderboardEntryItem
	viewerId?: string
}) {
	const entry = useFragment(GroupLeaderboardEntryFragment, item)
	const isTop3 = entry.rank <= 3
	return (
		<Table.Row active={entry.user.id === viewerId}>
			<Table.Cell
				numeric
				className={css({
					color: isTop3 ? "primary.default" : "fg.subtle",
					fontWeight: isTop3 ? "bold" : "inherit",
					fontSize: "sm",
					fontFamily: "mono",
				})}
			>
				{entry.rank}
			</Table.Cell>
			<Table.Cell>
				<HStack gap="3">
					<Avatar size="sm" name={entry.user.name} />
					<span className={css({ fontSize: "sm", fontWeight: "medium" })}>
						{entry.user.name} (@{entry.user.username})
					</span>
					{entry.user.id === viewerId && <Tag>You</Tag>}
					{entry.role === "ADMIN" && <Tag variant="primary">Admin</Tag>}
				</HStack>
			</Table.Cell>
			<Table.Cell
				numeric
				className={css({ fontFamily: "mono", fontSize: "sm" })}
			>
				{entry.totalPoints}
			</Table.Cell>
		</Table.Row>
	)
}

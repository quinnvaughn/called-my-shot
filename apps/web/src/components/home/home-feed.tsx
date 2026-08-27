import { useApolloClient } from "@apollo/client/react"
import { useEffect, useRef, useState } from "react"
import { VStack } from "styled-system/jsx"
import type { QuestionCardFragment } from "#/components/questions/question-card"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { Tabs } from "#/components/ui/tabs"
import type { FragmentType } from "#/graphql/generated"
import type {
	HomeSearchQuery,
	QuestionSortOrder,
} from "#/graphql/generated/graphql"
import { HomeFeedDocument } from "#/graphql/queries/home"
import { HomeSearchBar } from "./home-search-bar"

type League = { id: string; name: string; abbreviation: string; slug: string }
type PageInfo = { hasNextPage: boolean; endCursor: string | null }
type QuestionItem = { id: string } & FragmentType<typeof QuestionCardFragment>
type TeamOption = HomeSearchQuery["teams"][number]

type HomeFeedProps = {
	leagues: League[]
	initialItems: QuestionItem[]
	initialPageInfo: PageInfo
}

// The search box has exactly one active value at a time - free text or a
// picked team, never both. Modeling it as one field instead of two
// independently-clearable ones (search + teamId) makes "picking one clears
// the other" true by construction rather than something every setter has to
// remember to do.
type ActiveFilter =
	| { kind: "search"; term: string }
	| { kind: "team"; team: TeamOption }

const PAGE_SIZE = 10

export function HomeFeed({
	leagues,
	initialItems,
	initialPageInfo,
}: HomeFeedProps) {
	const client = useApolloClient()

	const [leagueId, setLeagueId] = useState<string | null>(null)
	const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null)
	const [sort, setSort] = useState<QuestionSortOrder>("HOT")
	// Off by default (shows everything) - flipping it filters down to
	// admin-curated content only (synced team_vs_team questions, season
	// awards), same isOfficial the create-question form gates to admins.
	const [officialOnly, setOfficialOnly] = useState(false)

	const search = activeFilter?.kind === "search" ? activeFilter.term : null
	const teamId = activeFilter?.kind === "team" ? activeFilter.team.id : null

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
				query: HomeFeedDocument,
				variables: {
					first: PAGE_SIZE,
					after: null,
					leagueId,
					teamId,
					search,
					isOfficial: officialOnly ? true : null,
					sort,
				},
				fetchPolicy: "network-only",
			})
			.then(({ data }) => {
				if (cancelled) return
				setItems(data?.questions.items ?? [])
				setPageInfo(
					data?.questions.pageInfo ?? { hasNextPage: false, endCursor: null },
				)
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [client, leagueId, teamId, search, officialOnly, sort])

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: HomeFeedDocument,
				variables: {
					first: PAGE_SIZE,
					after: pageInfo.endCursor,
					leagueId,
					teamId,
					search,
					isOfficial: officialOnly ? true : null,
					sort,
				},
				fetchPolicy: "network-only",
			})
			setItems((prev) => [...prev, ...(data?.questions.items ?? [])])
			setPageInfo(
				data?.questions.pageInfo ?? { hasNextPage: false, endCursor: null },
			)
		} finally {
			setLoading(false)
		}
	}

	function handleLeagueChange(next: string) {
		setLeagueId(next === "all" ? null : next)
		// A team belongs to exactly one league, so a team filter from the league
		// we're leaving can't stay selected once the sport narrows. Free-text
		// search isn't league-specific in the same way, so it's left alone.
		setActiveFilter((prev) => (prev?.kind === "team" ? null : prev))
	}

	function handleSelectTeam(team: TeamOption) {
		setActiveFilter({ kind: "team", team })
		// The league tab has to agree with the team filter - jump it to match
		// rather than leaving a contradiction that would just return nothing
		// (e.g. picking the Celtics while the NFL tab is active).
		setLeagueId(team.league.id)
	}

	function handleCommitSearch(term: string) {
		setActiveFilter(term ? { kind: "search", term } : null)
	}

	return (
		<VStack alignItems="stretch" gap="4">
			<HomeSearchBar
				onCommitSearch={handleCommitSearch}
				onSelectTeam={handleSelectTeam}
			/>

			<Tabs value={leagueId ?? "all"} onValueChange={handleLeagueChange}>
				<Tabs.List>
					<Tabs.Trigger value="all">All Sports</Tabs.Trigger>
					{leagues.map((league) => (
						<Tabs.Trigger key={league.id} value={league.id}>
							{league.abbreviation}
						</Tabs.Trigger>
					))}
				</Tabs.List>
			</Tabs>

			<Tabs value={sort} onValueChange={setSort}>
				<Tabs.List>
					<Tabs.Trigger value="HOT">Hot</Tabs.Trigger>
					<Tabs.Trigger value="NEW">New</Tabs.Trigger>
					<Tabs.Trigger value="CLOSING_SOON">Closing Soon</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			<Tabs
				value={officialOnly ? "official" : "all"}
				onValueChange={(v) => setOfficialOnly(v === "official")}
			>
				<Tabs.List>
					<Tabs.Trigger value="all">All</Tabs.Trigger>
					<Tabs.Trigger value="official">Official</Tabs.Trigger>
				</Tabs.List>
			</Tabs>

			<InfiniteScroll
				items={items}
				getKey={(item) => item.id}
				hasNextPage={pageInfo.hasNextPage}
				loading={loading}
				onLoadMore={loadMore}
				emptyState={<EmptyState>No questions match that.</EmptyState>}
				renderItem={(item) => <QuestionCard question={item} />}
			/>
		</VStack>
	)
}

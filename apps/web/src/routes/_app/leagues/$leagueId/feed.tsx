import { useApolloClient } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { VStack } from "styled-system/jsx"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { Tabs } from "#/components/ui/tabs"
import { TextInput } from "#/components/ui/text-input"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import { LeagueFeedDocument } from "#/graphql/queries/sports"

export const Route = createFileRoute("/_app/leagues/$leagueId/feed")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context, params }) => {
		const { data } = await context.apolloClient.query({
			query: LeagueFeedDocument,
			variables: {
				leagueId: params.leagueId,
				first: PAGE_SIZE,
				after: null,
				sort: "HOT",
			},
			fetchPolicy: "network-only",
		})
		return {
			items: data?.questions.items ?? [],
			pageInfo: data?.questions.pageInfo ?? {
				hasNextPage: false,
				endCursor: null,
			},
		}
	},
})

const PAGE_SIZE = 10

// Everything in this league that isn't a season award single or a ballot
// member - those live on the Season tab instead (see excludeBallotMembers on
// LeagueFeedDocument). Same search/sort/official-toggle as the old
// cross-league home feed, minus the league-selector tab: you're already in
// this league's room, so there's nothing left to pick.
function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { items: initialItems, pageInfo: initialPageInfo } =
		Route.useLoaderData()
	const client = useApolloClient()

	const [search, setSearch] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")
	const [sort, setSort] = useState<QuestionSortOrder>("HOT")
	const [officialOnly, setOfficialOnly] = useState(false)

	const [items, setItems] = useState(initialItems)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
	const [loading, setLoading] = useState(false)
	const skipNextFetch = useRef(true)

	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
		return () => clearTimeout(id)
	}, [search])

	useEffect(() => {
		if (skipNextFetch.current) {
			skipNextFetch.current = false
			return
		}
		let cancelled = false
		setLoading(true)
		client
			.query({
				query: LeagueFeedDocument,
				variables: {
					leagueId,
					first: PAGE_SIZE,
					after: null,
					search: debouncedSearch || undefined,
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
	}, [client, leagueId, debouncedSearch, officialOnly, sort])

	async function loadMore() {
		if (loading || !pageInfo.hasNextPage || !pageInfo.endCursor) return
		setLoading(true)
		try {
			const { data } = await client.query({
				query: LeagueFeedDocument,
				variables: {
					leagueId,
					first: PAGE_SIZE,
					after: pageInfo.endCursor,
					search: debouncedSearch || undefined,
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

	return (
		<VStack alignItems="stretch" gap="4">
			<TextInput>
				<TextInput.Group>
					<TextInput.Field
						placeholder="Search this league's questions…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</TextInput.Group>
			</TextInput>

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

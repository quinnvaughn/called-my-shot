import { useApolloClient } from "@apollo/client/react"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { css } from "styled-system/css"
import { HStack, VStack } from "styled-system/jsx"
import {
	FeedSearchField,
	type SelectedTeam,
} from "#/components/leagues/feed-search-field"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import { LeagueFeedDocument } from "#/graphql/queries/sports"

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "CLOSING_SOON", label: "Closing Soon" },
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

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
				sort: "CLOSING_SOON",
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
// LeagueFeedDocument). Search/autocomplete is the same shape the old
// cross-league home feed used, scoped to one league instead of site-wide -
// no league-selector tab here, you're already in this league's room.
function RouteComponent() {
	const { leagueId } = Route.useParams()
	const { items: initialItems, pageInfo: initialPageInfo } =
		Route.useLoaderData()
	const { league } = useLoaderData({ from: "/_app/leagues/$leagueId" })
	const client = useApolloClient()

	const [search, setSearch] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")
	const [teamId, setTeamId] = useState<string | null>(null)
	const [sort, setSort] = useState<QuestionSortOrder>("CLOSING_SOON")

	const [items, setItems] = useState(initialItems)
	const [pageInfo, setPageInfo] = useState(initialPageInfo)
	const [loading, setLoading] = useState(false)
	const skipNextFetch = useRef(true)

	useEffect(() => {
		const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
		return () => clearTimeout(id)
	}, [search])

	// Typing (as opposed to picking a suggestion) always means "go back to a
	// plain text search" - drops whatever precise teamId a prior suggestion
	// pick set, same as clearing a filter chip would.
	function handleSearchChange(text: string) {
		setSearch(text)
		setTeamId(null)
	}

	function handleSelectTeam(team: SelectedTeam) {
		setSearch(team.name)
		setTeamId(team.id)
	}

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
					// A selected team is a precise filter on its own - pairing it
					// with the substring `search` (now just that team's own name)
					// would needlessly AND the two together, so teamId wins
					// outright when set.
					...(teamId ? { teamId } : { search: debouncedSearch || undefined }),
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
	}, [client, leagueId, debouncedSearch, teamId, sort])

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
					...(teamId ? { teamId } : { search: debouncedSearch || undefined }),
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
			<FeedSearchField
				leagueId={leagueId}
				value={search}
				onValueChange={handleSearchChange}
				onSelectTeam={handleSelectTeam}
				placeholder={`Search${league?.name ? ` ${league.name}` : ""} questions…`}
			/>

			<HStack gap="2" alignItems="center" flexWrap="wrap">
				<span
					className={css({
						fontFamily: "mono",
						fontSize: "2xs",
						letterSpacing: "wide",
						textTransform: "uppercase",
						color: "fg.subtle",
					})}
				>
					Sort
				</span>
				{SORTS.map((s) => {
					const active = sort === s.value
					return (
						<button
							key={s.value}
							type="button"
							onClick={() => setSort(s.value)}
							className={css({
								fontFamily: "mono",
								fontSize: "2xs",
								letterSpacing: "wide",
								padding: "{spacing.1.5} {spacing.2.5}",
								borderRadius: "md",
								border: active
									? "1px solid {colors.border.emphasized}"
									: "1px solid {colors.border.default}",
								color: active ? "fg.default" : "fg.subtle",
								bg: active ? "bg.subtle" : "transparent",
								cursor: "pointer",
								transition:
									"color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease",
								_hover: {
									color: "fg.default",
									borderColor: "border.emphasized",
								},
							})}
						>
							{s.label}
						</button>
					)
				})}
			</HStack>

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

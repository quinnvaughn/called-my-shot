import { useApolloClient } from "@apollo/client/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { VStack } from "styled-system/jsx"
import {
	FeedSearchField,
	type SelectedTeam,
} from "#/components/leagues/feed-search-field"
import { QuestionCard } from "#/components/questions/question-card"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import { LeagueFeedDocument } from "#/graphql/queries/sports"

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "CLOSING_SOON", label: "Closing Soon" },
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

// team_vs_team questions are synced onto every upcoming game of the current
// season now (see syncGameQuestions) - under New/Most Called that would
// dominate the feed with the whole season's matchups, but Closing Soon
// already spreads them out by locksAt (each one only shows up once its own
// game is actually imminent), so there's nothing to exclude there.
function excludeGameWinners(sort: QuestionSortOrder): boolean {
	return sort !== "CLOSING_SOON"
}

// Same call as excludeGameWinners above, for the same reason - standalone
// season award races (player_season_award/team_season_award/
// player_award_finalists) already have their own dedicated home on the
// Season tab, so New/Most Called exclude them too. Closing Soon is left
// alone here as well.
function excludeSeasonAwards(sort: QuestionSortOrder): boolean {
	return sort !== "CLOSING_SOON"
}

// Most Called has no time decay at all - an old season's runaway-popular
// question would otherwise rank at the top forever. New already self-limits
// (an old question has an old createdAt, so it never surfaces there), and
// Closing Soon already requires status "open" with a future locksAt, which a
// past-season question essentially never satisfies - so only Most Called
// actually needs this.
function isCurrentSeasonOnly(sort: QuestionSortOrder): boolean {
	return sort === "MOST_CALLED"
}

// This feed's job is sourcing things to call - a resolved/disputed question
// has nothing left to do, so it doesn't belong under New or Most Called
// (same no-time-decay problem as excludeGameWinners/excludeSeasonAwards:
// without this, a settled question that went viral once could camp the top
// of Most Called forever). Closing Soon is a no-op here either way - its own
// condition already requires status "open" with a future locksAt, so a
// settled question can never appear there regardless of this flag.
function excludeSettled(sort: QuestionSortOrder): boolean {
	return sort !== "CLOSING_SOON"
}

export const Route = createFileRoute("/_app/leagues/$leagueSlug/feed")({
	component: RouteComponent,
	staleTime: 0,
	loader: async ({ context }) => {
		const { data } = await context.apolloClient.query({
			query: LeagueFeedDocument,
			variables: {
				leagueId: context.league.id,
				first: PAGE_SIZE,
				after: null,
				sort: "CLOSING_SOON",
				excludeGameWinners: excludeGameWinners("CLOSING_SOON"),
				excludeSeasonAwards: excludeSeasonAwards("CLOSING_SOON"),
				excludeSettled: excludeSettled("CLOSING_SOON"),
				currentSeasonOnly: isCurrentSeasonOnly("CLOSING_SOON"),
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
	const { items: initialItems, pageInfo: initialPageInfo } =
		Route.useLoaderData()
	// The room's own row, resolved from the url slug one level up - the feed
	// queries below are league-scoped by id, not slug.
	const { league } = Route.useRouteContext()
	const leagueId = league.id
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
					excludeGameWinners: excludeGameWinners(sort),
					excludeSeasonAwards: excludeSeasonAwards(sort),
					excludeSettled: excludeSettled(sort),
					currentSeasonOnly: isCurrentSeasonOnly(sort),
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
					excludeGameWinners: excludeGameWinners(sort),
					excludeSeasonAwards: excludeSeasonAwards(sort),
					excludeSettled: excludeSettled(sort),
					currentSeasonOnly: isCurrentSeasonOnly(sort),
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
				placeholder={`Search ${league.name} questions…`}
			/>

			<SortSwitcher sorts={SORTS} active={sort} onChange={setSort} />

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

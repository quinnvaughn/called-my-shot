import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
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
import { gqlInfiniteQueryOptions } from "#/graphql/query-options"
import { pageMeta } from "#/lib/meta"

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

const PAGE_SIZE = 10

type FeedFilters = {
	leagueId: string
	sort: QuestionSortOrder
	search?: string
	teamId?: string
}

// Every filter is part of the key, so changing sort, search text or team
// starts a fresh feed rather than appending to the previous one.
function leagueFeedQuery({ leagueId, sort, search, teamId }: FeedFilters) {
	return gqlInfiniteQueryOptions(
		LeagueFeedDocument,
		{
			leagueId,
			first: PAGE_SIZE,
			// A selected team is a precise filter on its own - pairing it with
			// the substring `search` (now just that team's own name) would
			// needlessly AND the two together, so teamId wins outright when set.
			...(teamId ? { teamId } : { search: search || undefined }),
			sort,
			excludeGameWinners: excludeGameWinners(sort),
			excludeSeasonAwards: excludeSeasonAwards(sort),
			excludeSettled: excludeSettled(sort),
			currentSeasonOnly: isCurrentSeasonOnly(sort),
		},
		(data) => data.questions,
	)
}

export const Route = createFileRoute("/_app/leagues/$leagueSlug/feed")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		context.queryClient.infiniteQuery(
			leagueFeedQuery({ leagueId: context.league.id, sort: "CLOSING_SOON" }),
		),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Feed · Called My Shot`,
			description: `Every open ${league.name} question in one place - sorted by what's closing soon, what's most called, and what's new.`,
			path: `/leagues/${league.slug}/feed`,
		})
	},
})

// Everything in this league that isn't a season award single or a ballot
// member - those live on the Season tab instead (see excludeBallotMembers on
// LeagueFeedDocument). Search/autocomplete is the same shape the old
// cross-league home feed used, scoped to one league instead of site-wide -
// no league-selector tab here, you're already in this league's room.
function RouteComponent() {
	// The room's own row, resolved from the url slug one level up - the feed
	// queries below are league-scoped by id, not slug.
	const { league } = Route.useRouteContext()
	const leagueId = league.id

	const [search, setSearch] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")
	const [teamId, setTeamId] = useState<string | null>(null)
	const [sort, setSort] = useState<QuestionSortOrder>("CLOSING_SOON")

	// keepPreviousData holds the current results in place while a new filter's
	// first page loads, rather than blanking the list between keystrokes.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...leagueFeedQuery({
			leagueId,
			sort,
			search: debouncedSearch,
			teamId: teamId ?? undefined,
		}),
		placeholderData: keepPreviousData,
	})

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
				items={data?.items ?? []}
				getKey={(item) => item.id}
				hasNextPage={hasNextPage}
				loading={isFetching}
				onLoadMore={fetchNextPage}
				emptyState={<EmptyState>No questions match that.</EmptyState>}
				renderItem={(item) => <QuestionCard question={item} />}
			/>
		</VStack>
	)
}

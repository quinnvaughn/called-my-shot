import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { css } from "styled-system/css"
import { VStack } from "styled-system/jsx"
import {
	FeedSearchField,
	type SelectedTeam,
} from "#/components/leagues/feed-search-field"
import { QuestionCard } from "#/components/questions/question-card"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { CardRail } from "#/components/ui/card-rail"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import {
	LeagueCommunityClosingSoonDocument,
	LeagueCommunityDocument,
} from "#/graphql/queries/sports"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"
import { pageMeta } from "#/lib/meta"

// Closing Soon isn't a sort here. It's bounded to the next 48 hours, so as a
// list it can come up empty while the league has plenty of open questions
// further out. It gets its own row above the list instead (ClosingSoonRow),
// which doesn't render when nothing qualifies.
const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

const DEFAULT_SORT: QuestionSortOrder = "MOST_CALLED"

// Most Called has no time decay at all - an old season's runaway-popular
// question would otherwise rank at the top forever. New already self-limits
// (an old question has an old createdAt, so it never surfaces there).
function isCurrentSeasonOnly(sort: QuestionSortOrder): boolean {
	return sort === "MOST_CALLED"
}

const PAGE_SIZE = 10

const CLOSING_SOON_LIMIT = 10

const closingSoonQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueCommunityClosingSoonDocument, {
		leagueId,
		first: CLOSING_SOON_LIMIT,
	})

type CommunityFilters = {
	leagueId: string
	sort: QuestionSortOrder
	search?: string
	teamId?: string
}

// Every filter is part of the key, so changing sort, search text or team
// starts a fresh list rather than appending to the previous one.
function leagueCommunityQuery({
	leagueId,
	sort,
	search,
	teamId,
}: CommunityFilters) {
	return gqlInfiniteQueryOptions(
		LeagueCommunityDocument,
		{
			leagueId,
			first: PAGE_SIZE,
			// A selected team is a precise filter on its own - pairing it with
			// the substring `search` (now just that team's own name) would
			// needlessly AND the two together, so teamId wins outright when set.
			...(teamId ? { teamId } : { search: search || undefined }),
			sort,
			// This tab's job is sourcing things to call - a resolved/disputed
			// question has nothing left to do (without this, a settled question
			// that went viral once could camp the top of Most Called forever).
			excludeSettled: true,
			currentSeasonOnly: isCurrentSeasonOnly(sort),
		},
		(data) => data.questions,
	)
}

export const Route = createFileRoute("/_app/leagues/$leagueSlug/community")({
	component: RouteComponent,
	staleTime: 0,
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.infiniteQuery(
				leagueCommunityQuery({
					leagueId: context.league.id,
					sort: DEFAULT_SORT,
				}),
			),
			context.queryClient.query(closingSoonQuery(context.league.id)),
		]),
	head: ({ match }) => {
		const league = match.context.league
		return pageMeta({
			title: `${league.name} · Community · Called My Shot`,
			description: `Open ${league.name} questions written by the community. See what's closing soon, what's most called, and what's new.`,
			path: `/leagues/${league.slug}/community`,
		})
	},
})

// Questions people wrote in this league. Official ones live elsewhere: game
// questions on each game's page (via the Games tab), season-long ones on the
// Season tab. Search/autocomplete is the same shape the old cross-league home
// feed used, scoped to one league instead of site-wide - no league-selector
// tab here, you're already in this league's room.
function RouteComponent() {
	// The room's own row, resolved from the url slug one level up - the
	// queries below are league-scoped by id, not slug.
	const { league } = Route.useRouteContext()
	const leagueId = league.id

	const [search, setSearch] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")
	const [teamId, setTeamId] = useState<string | null>(null)
	const [sort, setSort] = useState<QuestionSortOrder>(DEFAULT_SORT)

	// keepPreviousData holds the current results in place while a new filter's
	// first page loads, rather than blanking the list between keystrokes.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...leagueCommunityQuery({
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
			<ClosingSoonRow leagueId={leagueId} />

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

// Community questions locking in the next 48 hours, ahead of the list and
// untouched by its search and sort. Renders nothing when none qualify.
function ClosingSoonRow({ leagueId }: { leagueId: string }) {
	const { data } = useQuery(closingSoonQuery(leagueId))
	const questions = data?.questions.items ?? []

	if (questions.length === 0) return null

	return (
		<section aria-label="Closing soon">
			<CardRail
				items={questions}
				getKey={(question) => question.id}
				renderItem={(question) => <QuestionCard question={question} />}
				itemLabel="question"
				header={
					<span
						className={css({
							fontFamily: "mono",
							fontSize: "2xs",
							letterSpacing: "wide",
							textTransform: "uppercase",
							color: "fg.default",
							fontWeight: "bold",
						})}
					>
						Closing soon
					</span>
				}
			/>
		</section>
	)
}

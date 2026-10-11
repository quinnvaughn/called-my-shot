import {
	keepPreviousData,
	type QueryClient,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query"
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
	LeagueSeasonClosingSoonDocument,
	LeagueSeasonDocument,
} from "#/graphql/queries/sports"
import {
	gqlInfiniteQueryOptions,
	gqlQueryOptions,
} from "#/graphql/query-options"

// The Season tab's questions: every season-long one that isn't an award (stat
// lines, head-to-heads, leaders, props with no game), official and
// player-written together. Awards and titles live on the Ballots tab, and
// game questions on each game's page.
const SEASON_VARIABLES = {
	seasonLong: true,
	excludeSeasonAwards: true,
	excludeBallotMembers: true,
} as const

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

export const closingSoonQuery = (leagueId: string) =>
	gqlQueryOptions(LeagueSeasonClosingSoonDocument, {
		leagueId,
		first: CLOSING_SOON_LIMIT,
		...SEASON_VARIABLES,
	})

type FeedFilters = {
	leagueId: string
	sort: QuestionSortOrder
	search?: string
	teamId?: string
}

// Every filter is part of the key, so changing sort, search text or team
// starts a fresh list rather than appending to the previous one.
export function seasonQuestionFeedQuery({
	leagueId,
	sort,
	search,
	teamId,
}: FeedFilters) {
	return gqlInfiniteQueryOptions(
		LeagueSeasonDocument,
		{
			leagueId,
			first: PAGE_SIZE,
			...SEASON_VARIABLES,
			// A selected team is a precise filter on its own - pairing it with
			// the substring `search` (now just that team's own name) would
			// needlessly AND the two together, so teamId wins outright when set.
			...(teamId ? { teamId } : { search: search || undefined }),
			sort,
			// A browse list's job is sourcing things to call - a resolved or
			// disputed question has nothing left to do (without this, a settled
			// question that went viral once could camp the top of Most Called
			// forever).
			excludeSettled: true,
			currentSeasonOnly: isCurrentSeasonOnly(sort),
		},
		(data) => data.questions,
	)
}

// The first page and the Closing Soon row a route preloads before rendering.
export function preloadSeasonQuestionFeed(
	queryClient: QueryClient,
	leagueId: string,
) {
	return Promise.all([
		queryClient.infiniteQuery(
			seasonQuestionFeedQuery({ leagueId, sort: DEFAULT_SORT }),
		),
		queryClient.query(closingSoonQuery(leagueId)),
	])
}

// Search, sort and an endless list over one league's questions, with the
// ones closing soonest pulled up into a row above.
export function SeasonQuestionFeed({
	league,
	emptyText,
}: {
	league: { id: string; name: string }
	emptyText: string
}) {
	const [search, setSearch] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")
	const [teamId, setTeamId] = useState<string | null>(null)
	const [sort, setSort] = useState<QuestionSortOrder>(DEFAULT_SORT)

	// keepPreviousData holds the current results in place while a new filter's
	// first page loads, rather than blanking the list between keystrokes.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...seasonQuestionFeedQuery({
			leagueId: league.id,
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

	const isFiltered = debouncedSearch !== "" || teamId !== null

	return (
		<VStack alignItems="stretch" gap="4">
			<ClosingSoonRow leagueId={league.id} />

			<FeedSearchField
				leagueId={league.id}
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
				emptyState={
					<EmptyState>
						{isFiltered ? "No questions match that." : emptyText}
					</EmptyState>
				}
				renderItem={(item) => <QuestionCard question={item} />}
			/>
		</VStack>
	)
}

// The list's questions locking in the next 48 hours, ahead of it and
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

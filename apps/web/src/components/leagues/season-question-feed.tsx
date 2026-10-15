import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
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
import { useDebouncedValue } from "#/hooks/use-debounced-value"
import { ClosingSoonRow } from "./closing-soon-row"
import {
	DEFAULT_SORT,
	seasonQuestionFeedQuery,
} from "./season-question-feed-query"

// Closing Soon isn't a sort here. It's bounded to the next 48 hours, so as a
// list it can come up empty while the league has plenty of open questions
// further out. It gets its own row above the list instead (ClosingSoonRow),
// which doesn't render when nothing qualifies.
const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

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
	const debouncedSearch = useDebouncedValue(search.trim(), 300)
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

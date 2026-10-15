import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { VStack } from "styled-system/jsx"
import { QuestionCard } from "#/components/questions/question-card"
import { SortSwitcher } from "#/components/questions/sort-switcher"
import { button } from "#/components/ui/button"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { QuestionSortOrder } from "#/graphql/generated/graphql"
import { gqlInfiniteQueryOptions } from "#/graphql/query-options"
import { GameQuestionsDocument } from "#/graphql/sports/games/queries"

const SORTS: { value: QuestionSortOrder; label: string }[] = [
	{ value: "MOST_CALLED", label: "Most Called" },
	{ value: "NEW", label: "New" },
]

const PAGE_SIZE = 15

// sort is part of the key, so switching it starts a fresh list rather than
// appending to the previous ordering.
export const communityQuestionsQuery = (
	gameId: string,
	sort: QuestionSortOrder,
) =>
	gqlInfiniteQueryOptions(
		GameQuestionsDocument,
		{ gameId, first: PAGE_SIZE, sort, isOfficial: false },
		(data) => data.questions,
	)

export function GameCommunityQuestions({ gameId }: { gameId: string }) {
	const [sort, setSort] = useState<QuestionSortOrder>("MOST_CALLED")

	// keepPreviousData holds the current ordering on screen while the newly
	// picked sort's first page loads.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...communityQuestionsQuery(gameId, sort),
		placeholderData: keepPreviousData,
	})

	return (
		<VStack gap="4" alignItems="stretch">
			<SortSwitcher sorts={SORTS} active={sort} onChange={setSort} />

			<InfiniteScroll
				items={data?.items ?? []}
				getKey={(question) => question.id}
				hasNextPage={hasNextPage}
				loading={isFetching}
				onLoadMore={fetchNextPage}
				emptyState={
					<EmptyState
						action={
							<Link
								to="/new-question"
								className={button({ variant: "solid", size: "sm" })}
							>
								Create a question
							</Link>
						}
					>
						No community questions on this game yet. Why don't you get it
						started?
					</EmptyState>
				}
				renderItem={(question) => (
					<QuestionCard question={question} showGame={false} />
				)}
			/>
		</VStack>
	)
}

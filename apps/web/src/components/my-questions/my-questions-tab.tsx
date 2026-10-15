import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { MyQuestionSort, SortDirection } from "#/graphql/generated/graphql"
import {
	type MyQuestionsFilters,
	myQuestionsQuery,
} from "#/graphql/my-questions/queries"
import { MyQuestionCard } from "./my-question-card"

type MyQuestionsTabProps = {
	filters: MyQuestionsFilters
	sort: MyQuestionSort
	direction: SortDirection
	filtered: boolean
}

export function MyQuestionsTab({
	filters,
	sort,
	direction,
	filtered,
}: MyQuestionsTabProps) {
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...myQuestionsQuery(filters, sort, direction),
		placeholderData: keepPreviousData,
	})

	return (
		<InfiniteScroll
			items={data?.items ?? []}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetching}
			onLoadMore={fetchNextPage}
			emptyState={
				<EmptyState>
					{filtered ? "No questions match that." : "No questions asked yet."}
				</EmptyState>
			}
			renderItem={(item) => <MyQuestionCard question={item} />}
		/>
	)
}

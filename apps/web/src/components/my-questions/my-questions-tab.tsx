import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { MyQuestionSort } from "#/graphql/generated/graphql"
import {
	type MyQuestionsFilters,
	myQuestionsQuery,
} from "#/graphql/queries/my-questions"

export const MyQuestionsTabFragment = graphql(`
	fragment MyQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

type MyQuestionItem = { id: string } & FragmentType<
	typeof MyQuestionsTabFragment
>

type MyQuestionsTabProps = {
	filters: MyQuestionsFilters
	sort: MyQuestionSort
	filtered: boolean
}

export function MyQuestionsTab({
	filters,
	sort,
	filtered,
}: MyQuestionsTabProps) {
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...myQuestionsQuery(filters, sort),
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

function MyQuestionCard({ question }: { question: MyQuestionItem }) {
	const data = useFragment(MyQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

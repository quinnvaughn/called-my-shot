import { useApolloClient } from "@apollo/client/react"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { MyQuestionsDocument } from "#/graphql/queries/my-questions"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"

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
	initialItems: MyQuestionItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export function MyQuestionsTab({
	initialItems,
	initialPageInfo,
}: MyQuestionsTabProps) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<MyQuestionItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: MyQuestionsDocument,
					variables: { after },
				})
				return {
					items: data?.myQuestions.items ?? [],
					pageInfo: data?.myQuestions.pageInfo ?? {
						hasNextPage: false,
						endCursor: null,
					},
				}
			},
		)

	return (
		<InfiniteScroll
			items={items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={loading}
			onLoadMore={loadMore}
			emptyState={<EmptyState>No questions asked yet.</EmptyState>}
			renderItem={(item) => <MyQuestionCard question={item} />}
		/>
	)
}

function MyQuestionCard({ question }: { question: MyQuestionItem }) {
	const data = useFragment(MyQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

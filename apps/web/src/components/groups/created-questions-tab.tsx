import { useApolloClient } from "@apollo/client/react"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"

export const CreatedQuestionsTabFragment = graphql(`
	fragment CreatedQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

export const CreatedQuestionsDocument = graphql(`
	query CreatedQuestions($groupId: ID!, $after: String) {
		group(id: $groupId) {
			id
			createdQuestions(first: 10, after: $after) {
				items {
					id
					...CreatedQuestionsTab_question
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

type CreatedQuestionItem = { id: string } & FragmentType<
	typeof CreatedQuestionsTabFragment
>

type CreatedQuestionsTabProps = {
	groupId: string
	initialItems: CreatedQuestionItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export function CreatedQuestionsTab({
	groupId,
	initialItems,
	initialPageInfo,
}: CreatedQuestionsTabProps) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<CreatedQuestionItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: CreatedQuestionsDocument,
					variables: { groupId, after },
				})
				return {
					items: data?.group?.createdQuestions.items ?? [],
					pageInfo: data?.group?.createdQuestions.pageInfo ?? {
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
			emptyState={<EmptyState>No questions created yet.</EmptyState>}
			renderItem={(item) => <CreatedQuestionCard question={item} />}
		/>
	)
}

function CreatedQuestionCard({ question }: { question: CreatedQuestionItem }) {
	const data = useFragment(CreatedQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

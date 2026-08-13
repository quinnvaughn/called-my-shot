import { useApolloClient } from "@apollo/client/react"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"

export const SharedQuestionsTabFragment = graphql(`
	fragment SharedQuestionsTab_questionShare on QuestionShare {
		sharedBy {
			name
		}
		question {
			id
			...QuestionCard_question
		}
	}
`)

export const SharedQuestionsDocument = graphql(`
	query SharedQuestions($groupId: ID!, $after: String) {
		group(id: $groupId) {
			id
			sharedQuestions(first: 10, after: $after) {
				items {
					id
					...SharedQuestionsTab_questionShare
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

type SharedQuestionItem = { id: string } & FragmentType<
	typeof SharedQuestionsTabFragment
>

type SharedQuestionsTabProps = {
	groupId: string
	initialItems: SharedQuestionItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export function SharedQuestionsTab({
	groupId,
	initialItems,
	initialPageInfo,
}: SharedQuestionsTabProps) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<SharedQuestionItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: SharedQuestionsDocument,
					variables: { groupId, after },
				})
				return {
					items: data?.group?.sharedQuestions.items ?? [],
					pageInfo: data?.group?.sharedQuestions.pageInfo ?? {
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
			emptyState={<EmptyState>No shared questions yet.</EmptyState>}
			renderItem={(item) => <SharedQuestionCard share={item} />}
		/>
	)
}

function SharedQuestionCard({ share }: { share: SharedQuestionItem }) {
	const data = useFragment(SharedQuestionsTabFragment, share)
	return <QuestionCard question={data.question} sharedBy={data.sharedBy} />
}

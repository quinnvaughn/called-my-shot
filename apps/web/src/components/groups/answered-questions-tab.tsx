import { useApolloClient } from "@apollo/client/react"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"

export const AnsweredQuestionsTabFragment = graphql(`
	fragment AnsweredQuestionsTab_call on Call {
		id
		...CallCard_call
	}
`)

export const AnsweredQuestionsDocument = graphql(`
	query AnsweredQuestions($groupId: ID!, $after: String) {
		group(id: $groupId) {
			id
			answeredQuestions(first: 10, after: $after) {
				items {
					id
					...AnsweredQuestionsTab_call
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

type AnsweredQuestionItem = { id: string } & FragmentType<
	typeof AnsweredQuestionsTabFragment
>

type AnsweredQuestionsTabProps = {
	groupId: string
	initialItems: AnsweredQuestionItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export function AnsweredQuestionsTab({
	groupId,
	initialItems,
	initialPageInfo,
}: AnsweredQuestionsTabProps) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<AnsweredQuestionItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: AnsweredQuestionsDocument,
					variables: { groupId, after },
				})
				return {
					items: data?.group?.answeredQuestions.items ?? [],
					pageInfo: data?.group?.answeredQuestions.pageInfo ?? {
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
			emptyState={<EmptyState>No answered questions yet.</EmptyState>}
			renderItem={(item) => <AnsweredQuestionCard call={item} />}
		/>
	)
}

function AnsweredQuestionCard({ call }: { call: AnsweredQuestionItem }) {
	const data = useFragment(AnsweredQuestionsTabFragment, call)
	return <CallCard call={data} />
}

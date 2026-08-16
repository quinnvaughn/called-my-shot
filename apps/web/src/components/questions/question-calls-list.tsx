import { useApolloClient } from "@apollo/client/react"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type { FragmentType } from "#/graphql/generated"
import { QuestionCallsDocument } from "#/graphql/queries/question"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"
import { CallRow, type CallRowFragment } from "./call-row"

type CallItem = { id: string } & FragmentType<typeof CallRowFragment>

type Props = {
	questionId: string
	initialItems: CallItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

// Every caller's pick, paginated - only rendered once the viewer has made
// their own call (see the route's "make your call to unlock" gate above
// this). Each CallRow still self-gates its pick fields through
// viewerCanSeePick regardless, this list just controls which calls are in
// scope.
export function QuestionCallsList({
	questionId,
	initialItems,
	initialPageInfo,
}: Props) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<CallItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: QuestionCallsDocument,
					variables: { id: questionId, after },
				})
				return {
					items: data?.question?.calls.items ?? [],
					pageInfo: data?.question?.calls.pageInfo ?? {
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
			emptyState={<EmptyState>No calls yet - be the first.</EmptyState>}
			renderItem={(item) => <CallRow call={item} />}
		/>
	)
}

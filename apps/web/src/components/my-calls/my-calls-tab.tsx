import { useApolloClient } from "@apollo/client/react"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { CallResolutionStatus } from "#/graphql/generated/graphql"
import { MyCallsDocument } from "#/graphql/queries/my-calls"
import { usePaginatedConnection } from "#/hooks/use-paginated-connection"

export const MyCallsTabFragment = graphql(`
	fragment MyCallsTab_call on Call {
		id
		...CallCard_call
	}
`)

type MyCallItem = { id: string } & FragmentType<typeof MyCallsTabFragment>

type MyCallsTabProps = {
	status: CallResolutionStatus
	initialItems: MyCallItem[]
	initialPageInfo: { hasNextPage: boolean; endCursor: string | null }
}

export function MyCallsTab({
	status,
	initialItems,
	initialPageInfo,
}: MyCallsTabProps) {
	const client = useApolloClient()
	const { items, hasNextPage, loading, loadMore } =
		usePaginatedConnection<MyCallItem>(
			{ items: initialItems, pageInfo: initialPageInfo },
			async (after) => {
				const { data } = await client.query({
					query: MyCallsDocument,
					variables: { status, after },
				})
				return {
					items: data?.myCalls.items ?? [],
					pageInfo: data?.myCalls.pageInfo ?? {
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
			emptyState={
				<EmptyState>
					{status === "OPEN" ? "No open calls yet." : "No resolved calls yet."}
				</EmptyState>
			}
			renderItem={(item) => <MyCallCard call={item} />}
		/>
	)
}

function MyCallCard({ call }: { call: MyCallItem }) {
	const data = useFragment(MyCallsTabFragment, call)
	return <CallCard call={data} />
}

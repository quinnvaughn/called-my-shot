import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type { CallResolutionStatus } from "#/graphql/generated/graphql"
import { myCallsQuery } from "#/graphql/queries/my-calls"

export const MyCallsTabFragment = graphql(`
	fragment MyCallsTab_call on Call {
		id
		...CallCard_call
	}
`)

type MyCallItem = { id: string } & FragmentType<typeof MyCallsTabFragment>

type MyCallsTabProps = {
	status: CallResolutionStatus
}

export function MyCallsTab({ status }: MyCallsTabProps) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(myCallsQuery(status))

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
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

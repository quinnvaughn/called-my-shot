import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import type {
	CallResolutionStatus,
	CallSortOrder,
} from "#/graphql/generated/graphql"
import { type MyCallsFilters, myCallsQuery } from "#/graphql/queries/my-calls"

export const MyCallsTabFragment = graphql(`
	fragment MyCallsTab_call on Call {
		id
		...CallCard_call
	}
`)

type MyCallItem = { id: string } & FragmentType<typeof MyCallsTabFragment>

type MyCallsTabProps = {
	status: CallResolutionStatus
	filters: MyCallsFilters
	sort: CallSortOrder
	// True when any filter is narrowing the list, so an empty result can say
	// "nothing matches" rather than "you've never done this".
	filtered: boolean
}

export function MyCallsTab({
	status,
	filters,
	sort,
	filtered,
}: MyCallsTabProps) {
	// keepPreviousData holds the current results in place while a new filter's
	// first page loads, rather than blanking the list between keystrokes.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...myCallsQuery(status, filters, sort),
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
					{filtered
						? "No calls match that."
						: status === "OPEN"
							? "No open calls yet."
							: "No resolved calls yet."}
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

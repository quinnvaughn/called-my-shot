import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import type {
	CallResolutionStatus,
	CallSortOrder,
	SortDirection,
} from "#/graphql/generated/graphql"
import { type MyCallsFilters, myCallsQuery } from "#/graphql/my-calls/queries"
import type { MyCallsKind } from "#/lib/my-calls-search"
import { MyCallCard } from "./my-call-card"

type MyCallsTabProps = {
	kind: MyCallsKind
	status: CallResolutionStatus
	filters: MyCallsFilters
	sort: CallSortOrder
	direction: SortDirection
	// True when any filter is narrowing the list, so an empty result can say
	// "nothing matches" rather than "you've never done this".
	filtered: boolean
}

export function MyCallsTab({
	kind,
	status,
	filters,
	sort,
	direction,
	filtered,
}: MyCallsTabProps) {
	// keepPreviousData holds the current results in place while a new filter's
	// first page loads, rather than blanking the list between keystrokes.
	const { data, hasNextPage, isFetching, fetchNextPage } = useInfiniteQuery({
		...myCallsQuery(status, filters, sort, direction),
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
						: `No ${status === "OPEN" ? "open" : "resolved"} ${kind === "game" ? "game" : "season"} calls yet.`}
				</EmptyState>
			}
			renderItem={(item) => <MyCallCard call={item} />}
		/>
	)
}

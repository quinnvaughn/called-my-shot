import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { questionCallsQuery } from "#/graphql/queries/question"
import { CallRow } from "./call-row"

type Props = {
	questionId: string
}

// Every call on this question, paginated - always rendered, whether or not
// the viewer has made their own call yet.

export function QuestionCallsList({ questionId }: Props) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(questionCallsQuery(questionId))

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={<EmptyState>No calls yet - be the first.</EmptyState>}
			renderItem={(item) => <CallRow call={item} />}
		/>
	)
}

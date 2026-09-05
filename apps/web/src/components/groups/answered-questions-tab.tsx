import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { CallCard } from "#/components/questions/call-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"

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

export const answeredQuestionsQuery = (groupId: string) =>
	gqlInfiniteQueryOptions(
		AnsweredQuestionsDocument,
		{ groupId },
		(data) => data.group?.answeredQuestions ?? EMPTY_CONNECTION,
	)

type AnsweredQuestionItem = { id: string } & FragmentType<
	typeof AnsweredQuestionsTabFragment
>

type AnsweredQuestionsTabProps = {
	groupId: string
}

export function AnsweredQuestionsTab({ groupId }: AnsweredQuestionsTabProps) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(answeredQuestionsQuery(groupId))

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={<EmptyState>No answered questions yet.</EmptyState>}
			renderItem={(item) => <AnsweredQuestionCard call={item} />}
		/>
	)
}

function AnsweredQuestionCard({ call }: { call: AnsweredQuestionItem }) {
	const data = useFragment(AnsweredQuestionsTabFragment, call)
	return <CallCard call={data} />
}

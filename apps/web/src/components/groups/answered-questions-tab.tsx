import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { graphql } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"
import { AnsweredQuestionCard } from "./answered-question-card"

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

import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"

export const CreatedQuestionsTabFragment = graphql(`
	fragment CreatedQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

export const CreatedQuestionsDocument = graphql(`
	query CreatedQuestions($groupId: ID!, $after: String) {
		group(id: $groupId) {
			id
			createdQuestions(first: 10, after: $after) {
				items {
					id
					...CreatedQuestionsTab_question
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

export const createdQuestionsQuery = (groupId: string) =>
	gqlInfiniteQueryOptions(
		CreatedQuestionsDocument,
		{ groupId },
		(data) => data.group?.createdQuestions ?? EMPTY_CONNECTION,
	)

type CreatedQuestionItem = { id: string } & FragmentType<
	typeof CreatedQuestionsTabFragment
>

type CreatedQuestionsTabProps = {
	groupId: string
}

export function CreatedQuestionsTab({ groupId }: CreatedQuestionsTabProps) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(createdQuestionsQuery(groupId))

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={<EmptyState>No questions created yet.</EmptyState>}
			renderItem={(item) => <CreatedQuestionCard question={item} />}
		/>
	)
}

function CreatedQuestionCard({ question }: { question: CreatedQuestionItem }) {
	const data = useFragment(CreatedQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

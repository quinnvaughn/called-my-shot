import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import {
	EMPTY_CONNECTION,
	gqlInfiniteQueryOptions,
} from "#/graphql/query-options"

export const SharedQuestionsTabFragment = graphql(`
	fragment SharedQuestionsTab_questionShare on QuestionShare {
		sharedBy {
			name
		}
		question {
			id
			...QuestionCard_question
		}
	}
`)

export const SharedQuestionsDocument = graphql(`
	query SharedQuestions($groupId: ID!, $after: String) {
		group(id: $groupId) {
			id
			sharedQuestions(first: 10, after: $after) {
				items {
					id
					...SharedQuestionsTab_questionShare
				}
				pageInfo {
					hasNextPage
					endCursor
				}
			}
		}
	}
`)

export const sharedQuestionsQuery = (groupId: string) =>
	gqlInfiniteQueryOptions(
		SharedQuestionsDocument,
		{ groupId },
		(data) => data.group?.sharedQuestions ?? EMPTY_CONNECTION,
	)

type SharedQuestionItem = { id: string } & FragmentType<
	typeof SharedQuestionsTabFragment
>

type SharedQuestionsTabProps = {
	groupId: string
}

export function SharedQuestionsTab({ groupId }: SharedQuestionsTabProps) {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(sharedQuestionsQuery(groupId))

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={<EmptyState>No shared questions yet.</EmptyState>}
			renderItem={(item) => <SharedQuestionCard share={item} />}
		/>
	)
}

function SharedQuestionCard({ share }: { share: SharedQuestionItem }) {
	const data = useFragment(SharedQuestionsTabFragment, share)
	return <QuestionCard question={data.question} sharedBy={data.sharedBy} />
}

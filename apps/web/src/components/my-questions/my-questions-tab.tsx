import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { QuestionCard } from "#/components/questions/question-card"
import { EmptyState } from "#/components/ui/empty-state"
import { InfiniteScroll } from "#/components/ui/infinite-scroll"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"
import { myQuestionsQuery } from "#/graphql/queries/my-questions"

export const MyQuestionsTabFragment = graphql(`
	fragment MyQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

type MyQuestionItem = { id: string } & FragmentType<
	typeof MyQuestionsTabFragment
>

export function MyQuestionsTab() {
	const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
		useSuspenseInfiniteQuery(myQuestionsQuery())

	return (
		<InfiniteScroll
			items={data.items}
			getKey={(item) => item.id}
			hasNextPage={hasNextPage}
			loading={isFetchingNextPage}
			onLoadMore={fetchNextPage}
			emptyState={<EmptyState>No questions asked yet.</EmptyState>}
			renderItem={(item) => <MyQuestionCard question={item} />}
		/>
	)
}

function MyQuestionCard({ question }: { question: MyQuestionItem }) {
	const data = useFragment(MyQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

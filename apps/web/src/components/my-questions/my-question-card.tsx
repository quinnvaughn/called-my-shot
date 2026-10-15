import { QuestionCard } from "#/components/questions/question-card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const MyQuestionsTabFragment = graphql(`
	fragment MyQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

type MyQuestionItem = { id: string } & FragmentType<
	typeof MyQuestionsTabFragment
>

export function MyQuestionCard({ question }: { question: MyQuestionItem }) {
	const data = useFragment(MyQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

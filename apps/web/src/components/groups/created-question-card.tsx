import { QuestionCard } from "#/components/questions/question-card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const CreatedQuestionsTabFragment = graphql(`
	fragment CreatedQuestionsTab_question on Question {
		id
		...QuestionCard_question
	}
`)

type CreatedQuestionItem = { id: string } & FragmentType<
	typeof CreatedQuestionsTabFragment
>

export function CreatedQuestionCard({
	question,
}: {
	question: CreatedQuestionItem
}) {
	const data = useFragment(CreatedQuestionsTabFragment, question)
	return <QuestionCard question={data} />
}

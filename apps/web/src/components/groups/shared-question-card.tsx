import { QuestionCard } from "#/components/questions/question-card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

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

type SharedQuestionItem = { id: string } & FragmentType<
	typeof SharedQuestionsTabFragment
>

export function SharedQuestionCard({ share }: { share: SharedQuestionItem }) {
	const data = useFragment(SharedQuestionsTabFragment, share)
	return <QuestionCard question={data.question} sharedBy={data.sharedBy} />
}

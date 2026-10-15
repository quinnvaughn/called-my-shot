import { CallCard } from "#/components/questions/call-card"
import { type FragmentType, graphql, useFragment } from "#/graphql/generated"

export const AnsweredQuestionsTabFragment = graphql(`
	fragment AnsweredQuestionsTab_call on Call {
		id
		...CallCard_call
	}
`)

type AnsweredQuestionItem = { id: string } & FragmentType<
	typeof AnsweredQuestionsTabFragment
>

export function AnsweredQuestionCard({ call }: { call: AnsweredQuestionItem }) {
	const data = useFragment(AnsweredQuestionsTabFragment, call)
	return <CallCard call={data} />
}

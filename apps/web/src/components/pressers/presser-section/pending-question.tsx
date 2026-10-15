import { PRESSER_ANSWER_MAX } from "@called-my-shot/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { PresserQaItem } from "#/components/pressers/presser-qa-item"
import { presserResultError } from "#/components/pressers/presser-result"
import { PresserTextForm } from "#/components/pressers/presser-text-form"
import { useGqlMutation } from "#/graphql/hooks"
import {
	AnswerPresserQuestionDocument,
	BlockUserDocument,
	invalidateAfterBlock,
	invalidatePressers,
} from "#/graphql/pressers/mutations"
import { toIdentity } from "#/lib/identity"
import { questionActions } from "./presser-actions"
import type { PresserData, QuestionData } from "./types"

export function PendingQuestion({
	presser: p,
	question: q,
}: {
	presser: PresserData
	question: QuestionData
}) {
	const answer = useGqlMutation(AnswerPresserQuestionDocument)
	const block = useGqlMutation(BlockUserDocument)
	const queryClient = useQueryClient()
	const asker = q.asker ? toIdentity(q.asker) : null

	async function submit(input: { answer?: string; noComment?: boolean }) {
		const data = await answer.mutateAsync({
			input: { questionId: q.id, ...input },
		})
		const error = presserResultError(data?.answerPresserQuestion)
		if (!error) await invalidatePressers(queryClient)
		return error
	}

	const onBlock = asker
		? async () => {
				await block.mutateAsync({ username: asker.username })
				await invalidateAfterBlock(queryClient)
			}
		: undefined

	return (
		<PresserQaItem
			asker={asker}
			callTitle={q.call?.question.title ?? null}
			body={q.body}
			answer={null}
			actions={questionActions(p, q, toIdentity(p.owner).id, onBlock)}
		>
			{p.isOpen && (
				<PresserTextForm
					label="Your answer"
					placeholder="Once it's answered, everyone can see the question and your answer."
					max={PRESSER_ANSWER_MAX}
					submitLabel="Answer"
					onSubmit={(text) => submit({ answer: text })}
					alternate={{
						label: "No comment",
						onSelect: () => submit({ noComment: true }),
					}}
				/>
			)}
		</PresserQaItem>
	)
}

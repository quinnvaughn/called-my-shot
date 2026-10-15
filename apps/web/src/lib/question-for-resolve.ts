import type { QuestionCallShape } from "#/components/questions/cast-call-form/use-cast-call-form"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { isRateStat } from "#/lib/field-signal"
import { toCallShape } from "#/lib/question-labels"

// What the admin resolve and overturn modals need to ask for a question's
// outcome.
export type QuestionForResolve = {
	id: string
	title: string
	shape: QuestionCallShape
	ouLine: number | null
	options: { id: string; label: string }[]
	// True only for a rate stat (batting average, ERA) - see formatGuess in
	// #/lib/field-signal.
	isRateStat: boolean
}

export function toQuestionForResolve(
	question: {
		id: string
		title: string
		shape: QuestionShape
		ouLine?: number | null
		options: { id: string; label: string }[]
	} & Parameters<typeof isRateStat>[0],
): QuestionForResolve {
	return {
		id: question.id,
		title: question.title,
		shape: toCallShape(question.shape),
		ouLine: question.ouLine ?? null,
		options: question.options,
		isRateStat: isRateStat(question),
	}
}

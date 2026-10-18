import { formatGuess } from "#/lib/field-signal"
import { optionDisplayLabel } from "#/lib/question-labels"
import { type CastCallFormState, isOverUnderShape } from "./use-cast-call-form"

type Picked = {
	selections: { optionId: string }[]
	guessValue?: number | null
}

// The pick a call form holds, the way the submit bar states it: the side with
// its line ("Over 224.5"), the team or player, or the guess. Null before
// anything is picked, and for several picks at once, which no one label
// covers.
export function callFormPickLabel(
	{ question, shape, bucket, isRateStat }: CastCallFormState,
	{ selections, guessValue }: Picked,
): string | null {
	if (!question || bucket === "multi") return null
	if (bucket === "numeric") {
		return guessValue == null ? null : formatGuess(guessValue, isRateStat)
	}
	const option = question.options.find((o) => o.id === selections[0]?.optionId)
	if (!option) return null
	return optionDisplayLabel(
		option.label,
		isOverUnderShape(shape),
		question.ouLine,
		isRateStat,
	)
}

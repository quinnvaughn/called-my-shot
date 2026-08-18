import { match } from "ts-pattern"
import type { QuestionType } from "#/graphql/generated/graphql"

export type FieldSignalData = {
	type: QuestionType
	callCount: number
	averageGuess: number | null
	numericHitRatePct: number | null
	options: {
		label: string
		fieldPct: number | null
		isCorrect: boolean | null
	}[]
}

// "At a glance" summary of what the field is doing on a question, shown next
// to the caller count on QuestionCard - what's actually informative differs
// by type, so each gets its own phrasing. MULTIPLE_CHOICE/MULTI_SELECT/
// OVER_UNDER have no version of this that isn't either the removed leading-
// option-and-percent line or a redundant caller count, so they render nothing
// here.
export function fieldSignal(question: FieldSignalData): string | null {
	const callers = callersText(question.callCount)

	return match(question.type)
		.with("YES_NO", () => {
			if (question.callCount === 0) return "No callers yet"
			const yes = question.options.find((o) => o.label === "Yes")
			if (!yes || yes.fieldPct === null) return callers
			return `${Math.round(yes.fieldPct)}% say yes · ${callers}`
		})
		.with("MULTIPLE_CHOICE", "MULTI_SELECT", "OVER_UNDER", () => null)
		.with("NUMERIC_GUESS", () => {
			if (question.callCount === 0) return "No callers yet"
			if (question.averageGuess === null) return callers
			return `avg guess ${formatGuess(question.averageGuess)} · ${callers}`
		})
		.exhaustive()
}

// Same "at a glance" spot as fieldSignal, but for a question that's already
// resolved - once there's a winner this reports how the field actually did
// against it instead of any in-progress framing.
export function resolvedFieldSignal(question: FieldSignalData): string {
	const callers = callersText(question.callCount)
	if (question.callCount === 0) return "No callers"

	return match(question.type)
		.with("YES_NO", "MULTIPLE_CHOICE", "OVER_UNDER", () => {
			const winner = question.options.find((o) => o.isCorrect)
			if (!winner || winner.fieldPct === null) return callers
			return `${Math.round(winner.fieldPct)}% called it · ${callers}`
		})
		.with("MULTI_SELECT", () => {
			const winners = question.options.filter(
				(o): o is typeof o & { fieldPct: number } =>
					o.isCorrect === true && o.fieldPct !== null,
			)
			if (winners.length === 0) return callers
			const avg =
				winners.reduce((sum, o) => sum + o.fieldPct, 0) / winners.length
			return `${Math.round(avg)}% avg hit rate · ${callers}`
		})
		.with("NUMERIC_GUESS", () => {
			if (question.numericHitRatePct === null) return callers
			return `${Math.round(question.numericHitRatePct)}% within tolerance · ${callers}`
		})
		.exhaustive()
}

// "1 caller" / "412 callers" - the plural check is repeated everywhere a raw
// callCount needs to read as a sentence (this file's own two summaries, the
// sticky submit bar, the field breakdown card), not just each of them
// re-checking count === 1 inline.
export function callersText(count: number): string {
	return `${count} ${count === 1 ? "caller" : "callers"}`
}

export function formatGuess(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

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
// by type, so each gets its own phrasing rather than a generic "N callers".
export function fieldSignal(question: FieldSignalData): string {
	const callersText = `${question.callCount} ${question.callCount === 1 ? "caller" : "callers"}`
	if (question.callCount === 0) return "No callers yet"

	return match(question.type)
		.with("YES_NO", () => {
			const yes = question.options.find((o) => o.label === "Yes")
			if (!yes || yes.fieldPct === null) return callersText
			return `${Math.round(yes.fieldPct)}% say yes · ${callersText}`
		})
		.with("MULTIPLE_CHOICE", "MULTI_SELECT", "OVER_UNDER", () => {
			const leading = leadingOption(question.options)
			if (!leading || leading.fieldPct === null) return callersText
			return `${leading.label} leading · ${Math.round(leading.fieldPct)}% · ${callersText}`
		})
		.with("NUMERIC_GUESS", () => {
			if (question.averageGuess === null) return callersText
			return `avg guess ${formatGuess(question.averageGuess)} · ${callersText}`
		})
		.exhaustive()
}

// Same "at a glance" spot as fieldSignal, but for a question that's already
// resolved - "Lakers leading · 62%" reads like the race is still on, so once
// there's a winner this reports how the field actually did against it
// instead.
export function resolvedFieldSignal(question: FieldSignalData): string {
	const callersText = `${question.callCount} ${question.callCount === 1 ? "caller" : "callers"}`
	if (question.callCount === 0) return "No callers"

	return match(question.type)
		.with("YES_NO", "MULTIPLE_CHOICE", "OVER_UNDER", () => {
			const winner = question.options.find((o) => o.isCorrect)
			if (!winner || winner.fieldPct === null) return callersText
			return `${Math.round(winner.fieldPct)}% called it · ${callersText}`
		})
		.with("MULTI_SELECT", () => {
			const winners = question.options.filter(
				(o): o is typeof o & { fieldPct: number } =>
					o.isCorrect === true && o.fieldPct !== null,
			)
			if (winners.length === 0) return callersText
			const avg =
				winners.reduce((sum, o) => sum + o.fieldPct, 0) / winners.length
			return `${Math.round(avg)}% avg hit rate · ${callersText}`
		})
		.with("NUMERIC_GUESS", () => {
			if (question.numericHitRatePct === null) return callersText
			return `${Math.round(question.numericHitRatePct)}% within tolerance · ${callersText}`
		})
		.exhaustive()
}

function leadingOption<T extends { fieldPct: number | null }>(
	options: T[],
): T | null {
	return options.reduce<T | null>((leader, option) => {
		if (option.fieldPct === null) return leader
		if (leader === null || option.fieldPct > (leader.fieldPct ?? -1))
			return option
		return leader
	}, null)
}

function formatGuess(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

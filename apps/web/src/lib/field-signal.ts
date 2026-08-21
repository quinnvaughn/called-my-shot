import { match } from "ts-pattern"
import type { QuestionType } from "#/graphql/generated/graphql"

export type FieldSignalData = {
	type: QuestionType
	callCount: number
	averageGuess: number | null
	options: {
		label: string
		fieldPct: number | null
		isCorrect: boolean | null
	}[]
}

// Split into a plain lead-in, an emphasized fragment, and a plain tail so the
// card can bold just the number/label that matters ("avg guess **24.6** · 47
// callers") without the caller having to parse the string back apart.
export type FieldSignal = { before: string; emphasis: string; after: string }

// "At a glance" summary of what the field is doing on a question, shown next
// to the caller count on QuestionCard - what's actually informative differs
// by type. Same computation whether the question is still open or already
// locked awaiting resolution - locked just freezes it at whatever it was.
export function fieldSignal(question: FieldSignalData): FieldSignal {
	const callers = callersText(question.callCount)
	const plain = (after: string): FieldSignal => ({
		before: "",
		emphasis: "",
		after,
	})

	if (question.callCount === 0) return plain("No callers yet")

	return match(question.type)
		.with("YES_NO", () => {
			const yes = question.options.find((o) => o.label === "Yes")
			if (!yes || yes.fieldPct === null) return plain(callers)
			return {
				before: "",
				emphasis: `${Math.round(yes.fieldPct)}%`,
				after: ` say yes · ${callers}`,
			}
		})
		.with("NUMERIC_GUESS", () => {
			if (question.averageGuess === null) return plain(callers)
			return {
				before: "avg guess ",
				emphasis: formatGuess(question.averageGuess),
				after: ` · ${callers}`,
			}
		})
		.with("MULTIPLE_CHOICE", () => {
			const leader = leadingOption(question.options)
			if (!leader) return plain(callers)
			return {
				before: "",
				emphasis: leader.label,
				after: ` leading · ${Math.round(leader.fieldPct)}% · ${callers}`,
			}
		})
		.with("OVER_UNDER", () => {
			const leader = leadingOption(question.options)
			if (!leader) return plain(callers)
			return {
				before: "",
				emphasis: `${Math.round(leader.fieldPct)}%`,
				after: ` said ${leader.label.toLowerCase()} · ${callers}`,
			}
		})
		.with("MULTI_SELECT", () => plain(callers))
		.exhaustive()
}

function leadingOption(
	options: FieldSignalData["options"],
): { label: string; fieldPct: number } | null {
	const withPct = options.filter(
		(o): o is { label: string; fieldPct: number; isCorrect: boolean | null } =>
			o.fieldPct !== null,
	)
	if (withPct.length === 0) return null
	return withPct.reduce((a, b) => (b.fieldPct > a.fieldPct ? b : a))
}

// "1 caller" / "412 callers" - the plural check is repeated everywhere a raw
// callCount needs to read as a sentence (this file's own summary, the sticky
// submit bar, the field breakdown card), not just each of them re-checking
// count === 1 inline.
export function callersText(count: number): string {
	return `${count} ${count === 1 ? "caller" : "callers"}`
}

export function formatGuess(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

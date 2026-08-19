import { match } from "ts-pattern"
import type { QuestionType } from "#/graphql/generated/graphql"

export type CallSummaryData = {
	guessValue: number | null
	conviction: number | null
	totalPoints: number | null
	question: { type: QuestionType; ouLine: number | null }
	selections: {
		conviction: number
		option: { label: string; isCorrect: boolean | null }
	}[]
}

// Every question type scores differently, so each needs its own formatting
// here - an over/under selection's label alone ("Over") loses the line the
// call was actually made against, and a multi_select call reads better as a
// hit count than a wall of every pick once it's resolved.
export function pickSummary(call: CallSummaryData): string {
	return match(call.question.type)
		.with("OVER_UNDER", () => formatOverUnder(call))
		.with("MULTI_SELECT", () => formatMultiSelect(call))
		.with("NUMERIC_GUESS", () => formatGuess(call))
		.with("MULTIPLE_CHOICE", "YES_NO", () => formatSingleSelection(call))
		.exhaustive()
}

function formatOverUnder(call: CallSummaryData): string {
	const selection = call.selections[0]
	if (!selection) return "—"
	return call.question.ouLine !== null
		? `${selection.option.label} ${call.question.ouLine}`
		: selection.option.label
}

function formatMultiSelect(call: CallSummaryData): string {
	if (call.selections.length === 0) return "—"
	// isCorrect is set on every option at once, at resolution - so any one
	// selection having it set means the question resolved and all of them do.
	const resolved = call.selections[0].option.isCorrect !== null
	if (!resolved) return call.selections.map((s) => s.option.label).join(", ")
	const hits = call.selections.filter((s) => s.option.isCorrect).length
	return `${hits} of ${call.selections.length} hit`
}

function formatGuess(call: CallSummaryData): string {
	return call.guessValue !== null ? String(call.guessValue) : "—"
}

function formatSingleSelection(call: CallSummaryData): string {
	const selection = call.selections[0]
	return selection ? selection.option.label : "—"
}

// Conviction lives in different places depending on type: numeric_guess sets
// it once on the call itself, single-selection types set it on their one
// selection. multi_select is the one case with no single number - up to 5
// picks, each with independent conviction - so that one is averaged and
// labeled "avg" rather than pretending it's one real value.
export function convictionSummary(call: CallSummaryData): string {
	return match(call.question.type)
		.with("NUMERIC_GUESS", () => (call.conviction !== null ? `${call.conviction}%` : "—"))
		.with("OVER_UNDER", "MULTIPLE_CHOICE", "YES_NO", () => {
			const selection = call.selections[0]
			return selection ? `${selection.conviction}%` : "—"
		})
		.with("MULTI_SELECT", () => {
			if (call.selections.length === 0) return "—"
			const avg =
				call.selections.reduce((sum, s) => sum + s.conviction, 0) /
				call.selections.length
			return `${Math.round(avg)}% avg`
		})
		.exhaustive()
}

// The points sign is authoritative for win/loss across every type, not a
// heuristic: selectionPoints (multiple_choice/yes_no/over_under, and each
// multi_select pick) is negative iff the pick was wrong, and numericGuessPoints
// is never negative at all - a numeric guess is scored purely by closeness to
// the field, so accuracy (hitTolerance) is a genuinely separate stat that can
// disagree with points and shouldn't drive this badge (see @called-my-shot/scoring).
export function resultState(
	totalPoints: number | null,
): { status: "pending" } | { status: "win" | "loss"; points: number } {
	if (totalPoints === null) return { status: "pending" }
	return { status: totalPoints >= 0 ? "win" : "loss", points: totalPoints }
}

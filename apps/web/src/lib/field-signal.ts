import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { pluralize } from "#/lib/pluralize"

export type FieldSignalData = {
	shape: QuestionShape
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
// by shape. Same computation whether the question is still open or already
// locked awaiting resolution - locked just freezes it at whatever it was.
export function fieldSignal(question: FieldSignalData): FieldSignal {
	const callers = callersText(question.callCount)
	const plain = (after: string): FieldSignal => ({
		before: "",
		emphasis: "",
		after,
	})

	if (question.callCount === 0) return plain("No callers yet")

	return match(question.shape)
		.with("YES_NO_PROP", () => {
			const yes = question.options.find((o) => o.label === "Yes")
			if (!yes || yes.fieldPct === null) return plain(callers)
			return {
				before: "",
				emphasis: `${Math.round(yes.fieldPct)}%`,
				after: ` say yes · ${callers}`,
			}
		})
		.with("PLAYER_STAT_NUMERIC_GUESS", "TEAM_STAT_NUMERIC_GUESS", () => {
			if (question.averageGuess === null) return plain(callers)
			return {
				before: "avg guess ",
				emphasis: formatGuess(question.averageGuess),
				after: ` · ${callers}`,
			}
		})
		.with(
		"PLAYER_VS_PLAYER",
		"PLAYER_VS_PLAYER_SEASON",
		"TEAM_VS_TEAM",
		"PLAYER_AWARD_FINALISTS",
		() => {
			const leader = leadingOption(question.options)
			if (!leader) return plain(callers)
			return {
				before: "",
				emphasis: leader.label,
				after: ` leading · ${Math.round(leader.fieldPct)}% · ${callers}`,
			}
		})
		.with(
			"PLAYER_STAT_OVER_UNDER",
			"TEAM_STAT_OVER_UNDER",
			"PLAYER_SEASON_STAT_OVER_UNDER",
			"TEAM_SEASON_STAT_OVER_UNDER",
			"GAME_TOTAL_OVER_UNDER",
			() => {
				const leader = leadingOption(question.options)
				if (!leader) return plain(callers)
				return {
					before: "",
					emphasis: `${Math.round(leader.fieldPct)}%`,
					after: ` said ${leader.label.toLowerCase()} · ${callers}`,
				}
			},
		)
		.with("PLAYER_SEASON_AWARD", "TEAM_SEASON_AWARD", () => plain(callers))
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

// "1 caller" / "412 callers" - shared everywhere a raw callCount needs to
// read as a sentence (this file's own summary, the sticky submit bar, the
// field breakdown card).
export function callersText(count: number): string {
	return `${count} ${pluralize(count, "caller")}`
}

export function formatGuess(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

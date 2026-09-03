import { match } from "ts-pattern"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { pluralize } from "#/lib/pluralize"

export type FieldSignalData = {
	shape: QuestionShape
	callCount: number
	averageGuess: number | null
	numericToleranceAbsolute: number | null
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
		.with(
			"PLAYER_STAT_NUMERIC_GUESS",
			"TEAM_STAT_NUMERIC_GUESS",
			"TEAM_SEASON_STAT_NUMERIC_GUESS",
			() => {
				if (question.averageGuess === null) return plain(callers)
				return {
					before: "avg guess ",
					emphasis: formatGuess(question.averageGuess, isRateStat(question)),
					after: ` · ${callers}`,
				}
			},
		)
		.with(
			"PLAYER_VS_PLAYER",
			"PLAYER_VS_PLAYER_SEASON",
			"TEAM_VS_TEAM",
			"PLAYER_GAME_STAT_LEADER",
			"PLAYER_AWARD_FINALISTS",
			() => {
				const leader = leadingOption(question.options)
				if (!leader) return plain(callers)
				return {
					before: "",
					emphasis: leader.label,
					after: ` leading · ${Math.round(leader.fieldPct)}% · ${callers}`,
				}
			},
		)
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

// True for a genuine rate stat (batting average, ERA) - see ToleranceSpec in
// @called-my-shot/scoring. Absolute-mode tolerance alone doesn't mean rate
// stat anymore: team_season_stat_numeric_guess (win totals) also snapshots
// an absolute-mode band, for a fixed-size tolerance, but a win total is
// still a whole number - the real "does this need a decimal point" signal is
// whether the tolerance amount itself is fractional (0.02 for batting
// average vs 5 for an NBA win total). numericToleranceAbsolute is checked
// first (set for every numeric_guess-family shape); an over/under shape has
// no tolerance snapshot on the question at all, so it falls back to the
// picked stat's own tolerance tier value instead - same signal, different
// source depending on shape. This one function is the single source of truth
// for that check - every call site below (and in call-summary.ts,
// resolution-summary.ts, question-result-block.tsx, resolve-question-modal.tsx,
// question-row-actions.tsx, use-cast-call-form.ts, $questionId.tsx) uses it
// rather than re-deriving the same logic, after exactly that duplication let
// win totals silently render as "5.000" instead of "5" in some of them and
// not others.
export function isRateStat(question: {
	numericToleranceAbsolute: number | null
	stat?: {
		toleranceTier?: { toleranceMode: string; toleranceValue: number } | null
	} | null
}): boolean {
	if (question.numericToleranceAbsolute != null) {
		return !Number.isInteger(question.numericToleranceAbsolute)
	}
	return (
		question.stat?.toleranceTier?.toleranceMode === "ABSOLUTE" &&
		!Number.isInteger(question.stat.toleranceTier.toleranceValue)
	)
}

// A rate stat (batting average, ERA) always displays padded to a fixed 3
// decimals - a trailing zero is meaningful there (".300" is a real, distinct
// value from ".3" read as "point three"), so trimming it the way a plain
// String()/toFixed would is actively wrong, not just imprecise. Every other
// stat keeps its natural precision instead (a counting-stat average like
// 27.4 never gets padded out to "27.400").
export function formatGuess(value: number, isRateStat = false): string {
	if (isRateStat) return value.toFixed(3)
	if (Number.isInteger(value)) return String(value)
	return String(Math.round(value * 1000) / 1000)
}

import { SPORTS_TIME_ZONE } from "@called-my-shot/schemas"
import {
	isNumericGuessShape,
	type QuestionShape,
} from "@called-my-shot/scoring"
import { DateTime } from "luxon"
import { db } from "../../db"

// The pick/shape vocabulary a resolved call gets described with. Extracted
// from routes/share.ts so the exported PNG and the resolution digest email
// (lib/email-digest.ts) can never describe the same pick two different ways -
// they are the same claim about the same call, arriving in two places.

// Keyed by QuestionShape rather than a loose string so a newly added shape
// fails the build here instead of silently falling back to "Other" on every
// share card - which is exactly what team_season_stat_numeric_guess and
// player_game_stat_leader had been doing. Mirrors shareCardShapeLabel in
// apps/web/src/lib/question-labels.ts.
export const SHAPE_LABEL: Record<QuestionShape, string> = {
	player_stat_over_under: "Player Prop",
	team_stat_over_under: "Team Prop",
	player_season_stat_over_under: "Season Prop",
	team_season_stat_over_under: "Season Prop",
	game_total_over_under: "Game Total",
	player_stat_numeric_guess: "Player Prop",
	team_stat_numeric_guess: "Team Prop",
	team_season_stat_numeric_guess: "Season Prop",
	player_vs_player: "Head-to-Head",
	player_vs_player_season: "Head-to-Head",
	team_vs_team: "Game Outcome",
	team_vs_team_season: "Head-to-Head",
	player_game_stat_leader: "Stat Leader",
	// See the matching entry in shareCardShapeLabel (apps/web/src/lib/
	// question-labels.ts) for why this one isn't "Stat Leader" too.
	player_season_stat_leader: "Multi-Way",
	yes_no_prop: "Yes/No",
	player_season_award: "Season Award",
	team_season_award: "Season Award",
	player_award_finalists: "Season Award",
}

// Mirrors isRateStat in apps/web/src/lib/field-signal.ts, against this
// route's own DB row rather than the GraphQL question - note the tolerance
// mode is the table's lowercase "absolute" here, not the GraphQL enum's
// "ABSOLUTE". Absolute mode alone does not mean rate stat: a win total
// snapshots an absolute band too (5 for the NBA, 1 for the NFL), so mode
// alone renders 13 wins as "13.000". The fractional tolerance amount (0.02
// for batting average vs 5 for a win total) is the signal that a decimal
// point is wanted at all.
export function isRateStat(question: {
	numericToleranceAbsolute: number | null
	stat?: {
		toleranceTier?: { toleranceMode: string; toleranceValue: number } | null
	} | null
}): boolean {
	if (question.numericToleranceAbsolute !== null) {
		return !Number.isInteger(question.numericToleranceAbsolute)
	}
	const tier = question.stat?.toleranceTier
	return (
		tier?.toleranceMode === "absolute" && !Number.isInteger(tier.toleranceValue)
	)
}

// Mirrors formatGuess in apps/web/src/lib/field-signal.ts - pads a rate
// stat (batting average, ERA) to a fixed 3 decimals so a value like 0.3
// doesn't silently read as ".3" instead of ".300" on the exported PNG. No
// shared module across the API/web boundary for this one either, same
// reasoning as SHAPE_LABEL/brandWordmark above.
export function formatGuess(value: number, isRateStat: boolean): string {
	if (isRateStat) return value.toFixed(3)
	return Number.isInteger(value)
		? String(value)
		: String(Math.round(value * 1000) / 1000)
}

// Mirrors formatCallDate in apps/web/src/lib/format-date.ts - the og card and
// the call page state the same date about the same call, so they can't be
// allowed to disagree. No shared module across the API/web boundary for the
// same reason as SHAPE_LABEL/formatGuess above.
//
// Zone and locale are both pinned. Left to the runtime, a call made at
// 2026-01-01T02:00:00Z prints "Jan 1, 2026" from Fly (UTC) and "Dec 31, 2025"
// in a browser in ET, and month names come out in whatever locale the process
// happens to default to.
export function formatCallDate(date: Date): string {
	return DateTime.fromJSDate(date, { zone: SPORTS_TIME_ZONE })
		.setLocale("en-US")
		.toFormat("MMM d, yyyy")
}

// Mirrors lib/call-summary.ts's pickSummary on the frontend, against this
// route's own DB-shaped call rather than the GraphQL Call type - no shared
// module between the two given the enum casing they each work off already
// differs (GraphQL's SCREAMING_SNAKE vs. this table's snake_case), same
// reasoning viewer-status-card.tsx's BASE_POINTS_BY_GQL_SHAPE bridge already
// documents.
export function buildPickLabel(call: {
	guessValue: number | null
	question: {
		shape: QuestionShape
		ouLine: number | null
		numericToleranceAbsolute: number | null
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
	}
	selections: { option: { label: string; isCorrect: boolean | null } }[]
}): string {
	const rateStat = isRateStat(call.question)
	// isNumericGuessShape rather than a hand-listed pair - this used to check
	// only player_/team_stat_numeric_guess and so labelled every
	// team_season_stat_numeric_guess call "-", which is the exact drift
	// NUMERIC_GUESS_SHAPES' own comment in @called-my-shot/scoring warns about.
	if (isNumericGuessShape(call.question.shape)) {
		return call.guessValue !== null
			? formatGuess(call.guessValue, rateStat)
			: "-"
	}
	if (
		call.question.shape === "player_season_award" ||
		call.question.shape === "team_season_award"
	) {
		if (call.selections.length === 0) return "-"
		// isCorrect is set on every option at once, at resolution - so any one
		// selection having it set means the question resolved and all of them
		// do. Counting hits before that point returns 0 and prints "0 of 3 hit"
		// on a call nobody has graded yet, which reads as a total whiff. Mirrors
		// formatMultiSelect in apps/web/src/lib/call-summary.ts.
		if (call.selections[0]?.option.isCorrect === null) {
			return call.selections.map((s) => s.option.label).join(", ")
		}
		const hits = call.selections.filter((s) => s.option.isCorrect).length
		return `${hits} of ${call.selections.length} hit`
	}
	const selection = call.selections[0]
	if (!selection) return "-"
	if (
		(call.question.shape === "player_stat_over_under" ||
			call.question.shape === "team_stat_over_under" ||
			call.question.shape === "player_season_stat_over_under" ||
			call.question.shape === "team_season_stat_over_under" ||
			call.question.shape === "game_total_over_under") &&
		call.question.ouLine !== null
	) {
		return `${selection.option.label} ${formatGuess(call.question.ouLine, rateStat)}`
	}
	return selection.option.label
}

// Everything the og:image card and the resolution digest need to describe one
// call, derived in a single batched query. Neither the aggregate
// field-percentage counts nor the quip are here: the first needs its own
// per-question count queries and only the card shows it, the second is a pure
// function of the call id (quipForCall) that either caller can apply.
//
// Batched by callIds because the digest resolves a whole email's worth at
// once; routes/share.ts passes a single id.
export type CallSummary = {
	callId: string
	questionId: string
	questionTitle: string
	questionShape: QuestionShape
	questionStatus: "open" | "locked" | "resolved" | "disputed" | "voided"
	leagueAbbr: string
	shapeLabel: string
	pickLabel: string
	// Null until the question resolves AND this call's points are final. The
	// card renders a pending face for that; the digest refuses to describe it
	// at all (see loadResolvedCallSummaries).
	points: number | null
	isWin: boolean | null
	conviction: number
	caseText: string | null
	// Numeric guesses only, once the actual value is in. An exact guess is its
	// own kind rather than a distance of 0, which reads as still being off.
	// `by` is formatted like the guess itself.
	closeness: { kind: "exact" } | { kind: "off"; by: string } | null
	userName: string
	username: string
	// Only meaningful for a single-selection call - routes/share.ts uses it to
	// look up that option's share of the field.
	soleOptionId: string | null
	// The whole point of the call page: a call made a year before it resolves
	// should read as one.
	createdAt: Date
	locksAt: Date
	resolvedAt: Date | null
}

export type ResolvedCallSummary = CallSummary & {
	points: number
	isWin: boolean
}

export async function loadCallSummaries(
	callIds: string[],
): Promise<Map<string, CallSummary>> {
	const byCallId = new Map<string, CallSummary>()
	if (callIds.length === 0) return byCallId

	const rows = await db.query.calls.findMany({
		where: { id: { in: callIds } },
		with: {
			user: { columns: { name: true, username: true } },
			question: {
				columns: {
					id: true,
					title: true,
					shape: true,
					status: true,
					locksAt: true,
					resolvedAt: true,
					ouLine: true,
					numericToleranceAbsolute: true,
					numericActualValue: true,
				},
				with: {
					league: { columns: { abbreviation: true } },
					stat: {
						columns: {},
						with: {
							toleranceTier: {
								columns: { toleranceMode: true, toleranceValue: true },
							},
						},
					},
				},
			},
			selections: {
				with: { option: { columns: { label: true, isCorrect: true } } },
			},
		},
	})

	for (const call of rows) {
		// A data-integrity drop, not a status gate - a call with no user or a
		// question with no league can't be described at all. Status is carried
		// through instead of filtered on, so an open call still gets a summary;
		// loadResolvedCallSummaries below is what applies the outcome gate.
		if (!call.user || !call.question?.league) continue

		// selections[].option is typed nullable purely because drizzle types
		// every `one` relation that way regardless of the FK's own nullability
		// (optionId is NOT NULL) - same non-issue documented at length in
		// lib/resolve-question.ts. Narrowed once, here, rather than re-guarded
		// at every later read.
		const selections = call.selections.filter(
			(s): s is typeof s & { option: NonNullable<(typeof s)["option"]> } =>
				s.option !== null,
		)

		const isNumeric = isNumericGuessShape(call.question.shape)
		const points = isNumeric
			? call.resultPoints
			: selections.length > 0 &&
					selections.every((s) => s.resultPoints !== null)
				? selections.reduce((sum, s) => sum + (s.resultPoints ?? 0), 0)
				: null
		const distance =
			isNumeric &&
			call.guessValue !== null &&
			call.question.numericActualValue !== null
				? Math.abs(call.guessValue - call.question.numericActualValue)
				: null
		const closeness: CallSummary["closeness"] =
			distance === null
				? null
				: distance === 0
					? { kind: "exact" }
					: {
							kind: "off",
							by: formatGuess(distance, isRateStat(call.question)),
						}

		byCallId.set(call.id, {
			callId: call.id,
			questionId: call.question.id,
			questionTitle: call.question.title,
			questionShape: call.question.shape,
			questionStatus: call.question.status,
			leagueAbbr: call.question.league.abbreviation.toUpperCase(),
			shapeLabel: SHAPE_LABEL[call.question.shape] ?? "Other",
			pickLabel: buildPickLabel({
				guessValue: call.guessValue,
				question: {
					shape: call.question.shape,
					ouLine: call.question.ouLine,
					numericToleranceAbsolute: call.question.numericToleranceAbsolute,
					stat: call.question.stat,
				},
				selections,
			}),
			points,
			isWin: points === null ? null : points >= 0,
			conviction: isNumeric
				? (call.conviction ?? 0)
				: selections.length > 0
					? Math.round(
							selections.reduce((sum, s) => sum + s.conviction, 0) /
								selections.length,
						)
					: 0,
			caseText: call.caseText,
			closeness,
			userName: call.user.name,
			username: call.user.username,
			soleOptionId:
				selections.length === 1 ? (selections[0]?.optionId ?? null) : null,
			createdAt: call.createdAt,
			locksAt: call.question.locksAt,
			resolvedAt: call.question.resolvedAt,
		})
	}

	return byCallId
}

// The digest's view of the same data. A call on a question that isn't resolved
// has no outcome to report, and a disputed one has an outcome nobody has
// agreed on yet - the resolution email must never describe either. Kept as a
// narrowing filter over loadCallSummaries rather than a flag on it, so that
// gate is preserved by construction: a caller that wants outcomes has to ask
// for this function by name, and one that forgets gets nullable points the
// type system won't let it print.
export async function loadResolvedCallSummaries(
	callIds: string[],
): Promise<Map<string, ResolvedCallSummary>> {
	const resolved = new Map<string, ResolvedCallSummary>()
	for (const [id, summary] of await loadCallSummaries(callIds)) {
		if (summary.questionStatus !== "resolved") continue
		// A question can be resolved while a specific call still has no final
		// points (it shouldn't, once resolved) - nothing should describe a
		// result that isn't there.
		if (summary.points === null || summary.isWin === null) continue
		resolved.set(id, { ...summary, points: summary.points, isWin: summary.isWin })
	}
	return resolved
}

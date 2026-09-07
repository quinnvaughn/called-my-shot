import {
	isNumericGuessShape,
	type QuestionShape,
} from "@called-my-shot/scoring"
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
		stat: { toleranceTier: { toleranceMode: string } | null } | null
	}
	selections: { option: { label: string; isCorrect: boolean | null } }[]
}): string {
	const isRateStat =
		call.question.numericToleranceAbsolute !== null ||
		call.question.stat?.toleranceTier?.toleranceMode === "absolute"
	// isNumericGuessShape rather than a hand-listed pair - this used to check
	// only player_/team_stat_numeric_guess and so labelled every
	// team_season_stat_numeric_guess call "-", which is the exact drift
	// NUMERIC_GUESS_SHAPES' own comment in @called-my-shot/scoring warns about.
	if (isNumericGuessShape(call.question.shape)) {
		return call.guessValue !== null
			? formatGuess(call.guessValue, isRateStat)
			: "-"
	}
	if (
		call.question.shape === "player_season_award" ||
		call.question.shape === "team_season_award"
	) {
		if (call.selections.length === 0) return "-"
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
		return `${selection.option.label} ${formatGuess(call.question.ouLine, isRateStat)}`
	}
	return selection.option.label
}

// Everything both the exported PNG and the resolution digest need to describe
// one resolved call, derived in a single batched query. Neither the aggregate
// field-percentage counts nor the quip are here: the first needs its own
// per-question count queries and only the card shows it, the second is a pure
// function of the call id (quipForCall) that either caller can apply.
//
// Batched by callIds because the digest resolves a whole email's worth at
// once; routes/share.ts passes a single id.
export type ResolvedCallSummary = {
	callId: string
	questionId: string
	questionTitle: string
	questionShape: QuestionShape
	leagueAbbr: string
	shapeLabel: string
	pickLabel: string
	points: number
	isWin: boolean
	conviction: number
	caseText: string | null
	closenessFieldPct: number | null
	isNumeric: boolean
	userName: string
	username: string
	// Only meaningful for a single-selection call - routes/share.ts uses it to
	// look up that option's share of the field.
	soleOptionId: string | null
}

export async function loadResolvedCallSummaries(
	callIds: string[],
): Promise<Map<string, ResolvedCallSummary>> {
	const byCallId = new Map<string, ResolvedCallSummary>()
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
					ouLine: true,
					numericToleranceAbsolute: true,
				},
				with: {
					league: { columns: { abbreviation: true } },
					stat: {
						columns: {},
						with: { toleranceTier: { columns: { toleranceMode: true } } },
					},
				},
			},
			selections: {
				with: { option: { columns: { label: true, isCorrect: true } } },
			},
		},
	})

	for (const call of rows) {
		// Same gate routes/share.ts applied before this was extracted: a call
		// on a question that isn't resolved has no outcome to report, and a
		// disputed one has an outcome nobody has agreed on yet.
		if (
			!call.user ||
			!call.question?.league ||
			call.question.status !== "resolved"
		) {
			continue
		}

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
		// A question can be resolved while a specific call still has no final
		// points (it shouldn't, once resolved) - nothing should describe a
		// result that isn't there.
		if (points === null) continue

		byCallId.set(call.id, {
			callId: call.id,
			questionId: call.question.id,
			questionTitle: call.question.title,
			questionShape: call.question.shape,
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
			isWin: points >= 0,
			conviction: isNumeric
				? (call.conviction ?? 0)
				: selections.length > 0
					? Math.round(
							selections.reduce((sum, s) => sum + s.conviction, 0) /
								selections.length,
						)
					: 0,
			caseText: call.caseText,
			closenessFieldPct: call.closenessFieldPct,
			isNumeric,
			userName: call.user.name,
			username: call.user.username,
			soleOptionId:
				selections.length === 1 ? (selections[0]?.optionId ?? null) : null,
		})
	}

	return byCallId
}

import {
	questionTitleWithGame,
	SPORTS_TIME_ZONE,
} from "@called-my-shot/schemas"
import {
	callMargin,
	isNumericGuessShape,
	type MarginBasis,
	type MarginVerdict,
	type QuestionShape,
	SHARE_CARD_SHAPE_LABEL as SHAPE_LABEL,
	STREAK_TAG_MIN,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import { DateTime } from "luxon"
import { match } from "ts-pattern"
import { db } from "../../db"

// The pick/shape vocabulary a resolved call gets described with. Extracted
// from routes/share.ts so the exported PNG and the resolution digest email
// (lib/email-digest.ts) can never describe the same pick two different ways -
// they are the same claim about the same call, arriving in two places.

// The badge strings live in @called-my-shot/scoring, so the exported PNG, the
// digest email and the call page's own badge read off one copy instead of
// three. Kept under the name this
// module has always used, since the PNG builders below and routes/share.ts
// both import it from here.
export { SHAPE_LABEL }

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
		// Names the picks whether or not the question has resolved: the card's
		// verdict and points already say how it went, and the label is dropped
		// into sentences where a hit count reads as nonsense. Mirrors
		// formatMultiSelect in apps/web/src/lib/call-summary.ts.
		return call.selections.map((s) => s.option.label).join(", ")
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

// The options a settled result is worth stating from, winner first - the DB
// mirror of Question.scoredOptions (graphql/types/question/question-object.ts).
// A head-to-head keeps both sides so the result reads as a scoreline; a leader
// pool keeps whoever led, since the also-rans carry numbers nothing shows.
function scoredOptionsFor(question: {
	shape: QuestionShape
	options: {
		label: string
		isCorrect: boolean | null
		actualValue: number | null
	}[]
}): { label: string; actualValue: number }[] {
	const scored = question.options.filter(
		(o): o is typeof o & { actualValue: number } => o.actualValue !== null,
	)
	return match(question.shape)
		.returnType<typeof scored>()
		.with(
			"player_vs_player",
			"player_vs_player_season",
			"team_vs_team",
			"team_vs_team_season",
			() =>
				[...scored].sort((a, b) => Number(b.isCorrect) - Number(a.isCorrect)),
		)
		.with(
			"player_game_stat_leader",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			() => scored.filter((o) => o.isCorrect),
		)
		.otherwise(() => [])
}

// Mirrors actualSummary in apps/web/src/lib/call-summary.ts, against this
// route's own DB-shaped call - same reasoning as buildPickLabel above for why
// there's no shared module between the two.
export function buildActualLabel(call: {
	question: {
		shape: QuestionShape
		numericActualValue: number | null
		numericToleranceAbsolute: number | null
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
		options: {
			label: string
			isCorrect: boolean | null
			actualValue: number | null
		}[]
	}
}): string | null {
	const rateStat = isRateStat(call.question)
	if (call.question.numericActualValue !== null) {
		return formatGuess(call.question.numericActualValue, rateStat)
	}
	const scored = scoredOptionsFor(call.question)
	const winner = scored[0]
	if (!winner) return null
	const values = scored
		.map((option) => formatGuess(option.actualValue, rateStat))
		.join(" to ")
	return `${winner.label}, ${values}`
}

// Mirrors marginLabel in apps/web/src/lib/call-summary.ts. The four words the
// card leads with in place of "Called it" / "Missed" - no shared module for
// the same reason as buildPickLabel above, and the two have to stay in step
// because the page and the picture of it are the same claim.
export function marginLabel(verdict: MarginVerdict, won: boolean): string {
	return match([verdict, won] as const)
		.with(["narrow", false], () => "Inches away")
		.with(["narrow", true], () => "By a hair")
		.with(["runaway", true], () => "Never in doubt")
		.with(["runaway", false], () => "Not close")
		.exhaustive()
}

// The tolerance band grading ran against, off this route's own DB row. Note
// the table's lowercase "absolute", not the GraphQL enum's "ABSOLUTE" - same
// casing split isRateStat above already documents.
function toleranceSpecOf(
	tolerance: { mode: string; value: number } | null,
): ToleranceSpec | null {
	if (!tolerance) return null
	return tolerance.mode === "absolute"
		? { mode: "absolute", amount: tolerance.value }
		: { mode: "percentage", pct: tolerance.value }
}

// Mirrors marginBasisFor in apps/web/src/lib/call-summary.ts - which two
// numbers this shape has to subtract, if it has two at all.
function marginBasisFor(call: {
	guessValue: number | null
	question: {
		shape: QuestionShape
		ouLine: number | null
		numericActualValue: number | null
		numericToleranceAbsolute: number | null
		numericTolerancePct: number | null
		stat: {
			toleranceTier: { toleranceMode: string; toleranceValue: number } | null
		} | null
		options: {
			label: string
			isCorrect: boolean | null
			actualValue: number | null
		}[]
	}
	selections: { option: { actualValue: number | null } }[]
}): MarginBasis | null {
	const { question } = call
	return match(question.shape)
		.returnType<MarginBasis | null>()
		.with(
			"player_stat_over_under",
			"team_stat_over_under",
			"player_season_stat_over_under",
			"team_season_stat_over_under",
			"game_total_over_under",
			() => {
				const tier = question.stat?.toleranceTier
				return question.numericActualValue !== null && question.ouLine !== null
					? {
							kind: "line",
							actual: question.numericActualValue,
							line: question.ouLine,
							spec: toleranceSpecOf(
								tier
									? { mode: tier.toleranceMode, value: tier.toleranceValue }
									: null,
							),
						}
					: null
			},
		)
		.with(
			"player_stat_numeric_guess",
			"team_stat_numeric_guess",
			"team_season_stat_numeric_guess",
			() => {
				const spec = toleranceSpecOf(
					question.numericToleranceAbsolute !== null
						? { mode: "absolute", value: question.numericToleranceAbsolute }
						: question.numericTolerancePct !== null
							? { mode: "percentage", value: question.numericTolerancePct }
							: null,
				)
				return call.guessValue !== null &&
					question.numericActualValue !== null &&
					spec !== null
					? {
							kind: "guess",
							guess: call.guessValue,
							actual: question.numericActualValue,
							spec,
						}
					: null
			},
		)
		.with(
			"player_vs_player",
			"player_vs_player_season",
			"team_vs_team",
			"team_vs_team_season",
			"player_game_stat_leader",
			"player_season_stat_leader",
			"player_team_season_stat_leader",
			() => {
				const scored = scoredOptionsFor(question)
				const winner = scored[0]
				if (!winner) return null
				// A head-to-head keeps both sides. A leader pool is trimmed to
				// whoever led, so the other number comes off this caller's own
				// pick - which is also why a leader WIN produces nothing: their
				// pick IS the winner, and callMargin drops a gap of zero.
				const other =
					scored[1]?.actualValue ??
					call.selections[0]?.option.actualValue ??
					null
				return other === null
					? null
					: { kind: "gap", winner: winner.actualValue, other }
			},
		)
		.with(
			"yes_no_prop",
			"player_award_finalists",
			"player_season_award",
			"team_season_award",
			() => null,
		)
		.exhaustive()
}

// How far this call landed from the line it was called against, judged.
// `points` is authoritative for win/loss across every shape (same rule
// resultState states on the web side), so it both gates this - a call with no
// final points has no outcome to be remarkable about - and tells callMargin
// which way the result went.
export function buildMargin(
	call: Parameters<typeof marginBasisFor>[0],
	points: number | null,
): { verdict: MarginVerdict; label: string } | null {
	if (points === null) return null
	const basis = marginBasisFor(call)
	if (basis === null) return null
	const won = points >= 0
	const margin = callMargin(basis, won)
	if (!margin?.verdict) return null
	return { verdict: margin.verdict, label: marginLabel(margin.verdict, won) }
}

// Everything the og:image card and the resolution digest need to describe one
// call, derived in a single batched query. The aggregate field-percentage
// counts are not here: they need their own per-question count queries and
// only the card shows them.
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
	// How remarkable this call's margin was, and the word the card leads with
	// in place of "Called it" / "Missed" because of it. Null on the ordinary
	// call, and on every shape with no two numbers to subtract. The verdict
	// rides along with the label so a caller that needs to branch on how
	// remarkable the margin was can read data rather than string-match the
	// copy. Deliberately not folded into
	// `closeness`: that one is a numeric guess's distance from the answer,
	// this is a judgement about any shape's distance from its line, and they
	// coexist on a numeric guess.
	margin: { verdict: MarginVerdict; label: string } | null
	// What the question actually came out to, already formatted. Mirrors
	// actualSummary in apps/web/src/lib/call-summary.ts - the question's own
	// number where the shape has one, otherwise what the subject of this
	// caller's own pick put up, named only on a miss. Null where nothing
	// numeric was recorded.
	actual: string | null
	// How far into its league-and-family streak this call was when it landed.
	// Same gate as Call.streak: a standing, scored win at least STREAK_TAG_MIN
	// into its run, otherwise null.
	streakLength: number | null
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
					// Percentage mode is the common case for a numeric guess
					// (Standard 15%, High-Volume 10%), so without this the band
					// buildMargin measures against is unknown on most of them.
					numericTolerancePct: true,
					numericActualValue: true,
				},
				with: {
					// Only the options carrying a number, for buildActualLabel - a
					// season award's whole-league pool never gets one, so this
					// costs nothing on the shapes with the biggest pools.
					options: {
						columns: { label: true, isCorrect: true, actualValue: true },
						where: { actualValue: { isNotNull: true } },
					},
					league: { columns: { abbreviation: true } },
					// Neither the card nor the email shows the game anywhere else,
					// so a game question's title carries its matchup in front.
					game: {
						columns: {},
						with: {
							homeTeam: { columns: { abbreviation: true } },
							awayTeam: { columns: { abbreviation: true } },
						},
					},
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
				// actualValue is this caller's OWN pick's number, which the
				// question's options above can't stand in for on a leader pool:
				// buildActualLabel trims those to whoever led, and the margin
				// needs whoever this caller backed.
				with: {
					option: {
						columns: { label: true, isCorrect: true, actualValue: true },
					},
				},
			},
		},
	})

	const positions = await db.query.callStreakPositions.findMany({
		where: { callId: { in: callIds }, length: { gte: STREAK_TAG_MIN } },
		columns: { callId: true, length: true },
	})
	const streakByCallId = new Map(positions.map((p) => [p.callId, p.length]))

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
			questionTitle: questionTitleWithGame(
				call.question.title,
				call.question.game,
			),
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
			margin: buildMargin(
				{
					guessValue: call.guessValue,
					question: {
						shape: call.question.shape,
						ouLine: call.question.ouLine,
						numericActualValue: call.question.numericActualValue,
						numericToleranceAbsolute: call.question.numericToleranceAbsolute,
						numericTolerancePct: call.question.numericTolerancePct,
						stat: call.question.stat,
						options: call.question.options,
					},
					selections,
				},
				points,
			),
			actual: buildActualLabel({
				question: {
					shape: call.question.shape,
					numericActualValue: call.question.numericActualValue,
					numericToleranceAbsolute: call.question.numericToleranceAbsolute,
					stat: call.question.stat,
					options: call.question.options,
				},
			}),
			// The streak cache is rebuilt shortly after a result changes, not
			// in the same transaction, so a row can briefly outlive the result
			// it was built from.
			streakLength:
				call.unscoredReason === null &&
				(call.question.status === "resolved" ||
					call.question.status === "disputed")
					? (streakByCallId.get(call.id) ?? null)
					: null,
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
		resolved.set(id, {
			...summary,
			points: summary.points,
			isWin: summary.isWin,
		})
	}
	return resolved
}

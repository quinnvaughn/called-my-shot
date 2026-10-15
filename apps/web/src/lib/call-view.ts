import type { CallRecordCardData } from "#/components/questions/call-record-card/types"
import type { CallRecordQuery } from "#/graphql/generated/graphql"
import { actualSummary, callMarginFor, pickSummary } from "#/lib/call-summary"
import { formatGuess, isRateStat } from "#/lib/field-signal"
import { formatCallDate } from "#/lib/format-date"
import { isNumericQuestionShape } from "#/lib/question-labels"

export type CallRecord = NonNullable<CallRecordQuery["call"]>

export type CallView = ReturnType<typeof describeCall>

// Everything the page and its meta tags both need, derived once. Mirrors what
// apps/api's share-cards/call-summary.ts derives for the og:image off the
// same call, so the page and the picture of it state the same facts.
export function describeCall(call: CallRecord) {
	const isNumeric = isNumericQuestionShape(call.question.shape)
	const points = call.totalPoints
	const isWin = points === null ? null : points >= 0

	const summaryData = {
		guessValue: call.guessValue,
		conviction: call.conviction,
		totalPoints: call.totalPoints,
		question: {
			shape: call.question.shape,
			ouLine: call.question.ouLine,
			numericActualValue: call.question.numericActualValue,
			numericToleranceAbsolute: call.question.numericToleranceAbsolute,
			numericTolerancePct: call.question.numericTolerancePct,
			stat: call.question.stat,
			scoredOptions: call.question.scoredOptions,
		},
		selections: call.selections.map((s) => ({
			id: s.id,
			conviction: s.conviction,
			option: {
				label: s.option.label,
				isCorrect: s.option.isCorrect,
				actualValue: s.option.actualValue,
			},
		})),
	}
	const pickLabel = pickSummary(summaryData)

	// "Field agreed" only means something for a lone selection. A numeric guess
	// is too specific for anyone to share it, and
	// player_season_award/team_season_award's several independent picks have
	// no single number, so both stay null rather than stating a share nobody
	// actually picked.
	const fieldPct =
		!isNumeric && call.selections.length === 1
			? (call.selections[0]?.option.fieldPct ?? null)
			: null

	// A numeric guess's closeness to the real number is its own stat: without
	// it the card states the guess and the points but never how near it landed.
	const distance =
		isNumeric &&
		call.guessValue !== null &&
		call.question.numericActualValue !== null
			? Math.abs(call.guessValue - call.question.numericActualValue)
			: null
	const closeness: CallRecordCardData["closeness"] =
		distance === null
			? null
			: distance === 0
				? { kind: "exact" }
				: {
						kind: "off",
						by: formatGuess(distance, isRateStat(call.question)),
					}

	const conviction = isNumeric
		? (call.conviction ?? 0)
		: call.selections.length > 0
			? Math.round(
					call.selections.reduce((sum, s) => sum + s.conviction, 0) /
						call.selections.length,
				)
			: 0

	// How far the call landed from its line, on every shape with two numbers
	// to subtract rather than just the numeric guesses `closeness` covers.
	// Null verdict is the ordinary case: the distance is worth stating, the
	// size of it isn't worth a word.
	const margin = callMarginFor(summaryData)

	// The abandoned pick, run through the same summariser as the live one so
	// the two read as the same kind of claim rather than one being a raw
	// label. Uses the question as it stands, which is right: the whole point
	// is to compare the two picks against the same outcome.
	const redo = call.redo
		? {
				originalCalledAt: call.redo.originalCreatedAt,
				redoneAt: call.redo.redoneAt,
				originalPickLabel: pickSummary({
					...summaryData,
					guessValue: call.redo.originalGuessValue,
					conviction: call.redo.originalConviction,
					selections: call.redo.originalSelections.map((s) => ({
						id: s.id,
						conviction: s.conviction,
						option: {
							label: s.option.label,
							isCorrect: s.option.isCorrect,
							actualValue: s.option.actualValue,
						},
					})),
				}),
				currentPickLabel: pickLabel,
				originalCaseText: call.redo.originalCaseText,
				// Null until the question resolves, which is when isCorrect
				// stops being null. A numeric guess has no "would the old
				// number have hit" without re-running the tolerance band, so
				// it stays null and the panel simply shows both guesses.
				originalWasCorrect: isNumeric
					? null
					: firstDefined(
							call.redo.originalSelections.map((s) => s.option.isCorrect),
						),
				currentIsWin: isWin,
			}
		: null

	return {
		pickLabel,
		points,
		isWin,
		fieldPct,
		closeness,
		margin,
		redo,
		actual: actualSummary({ question: summaryData.question }),
		conviction,
		username: call.user.username,
		name: call.user.name,
		avatarUrl: call.user.avatarUrl,
		leagueAbbr: call.question.league.abbreviation.toUpperCase(),
		calledAt: formatCallDate(call.createdAt),
		questionStatus: call.question.status,
		locksAt: call.question.locksAt,
		resolvedAt: call.question.resolvedAt,
	}
}

// An award call has several picks; it counts as having been right if any of
// them was. Null while the question is unresolved, where every isCorrect is
// still null.
export function firstDefined(
	flags: (boolean | null | undefined)[],
): boolean | null {
	if (flags.length === 0 || flags.every((f) => f === null || f === undefined)) {
		return null
	}
	return flags.some((f) => f === true)
}

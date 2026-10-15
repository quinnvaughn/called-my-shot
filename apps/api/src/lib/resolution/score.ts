import {
	basePointsFor,
	crowdTotals,
	effectiveLossRate,
	fieldPct,
	isPricedQuestion,
	numericGuessPoints,
	type QuestionShape,
	selectionPoints,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import type { CallUnscoredReason } from "../../db/schema"
import { addLeagueStatDelta, type LeagueStatDelta } from "../user-season-stats"
import { deltaFor, type NextResult, type PriorResult } from "./deltas"
import { type EarlinessBasis, earlinessFor } from "./earliness"

// A reason the resolution itself leaves a call unscored. question_voided isn't
// one of them - only voiding sets it, and resolving a question clears it.
export type ResolutionUnscoredReason = Exclude<
	CallUnscoredReason,
	"question_voided"
>

// Calls to leave unscored, keyed by caller.
export type UnscoredOverrides = ReadonlyMap<string, ResolutionUnscoredReason>

// Why a caller's call ends this resolution unscored, or null when it's scored.
// An override passed for this pass wins; otherwise a reason already persisted
// on the call stands, so an exclusion made at first resolution survives an
// overturn or admin re-resolve that doesn't pass it again. question_voided is
// the one persisted reason that doesn't - resolving is what lifts it.
export function unscoredReasonFor(
	overrides: UnscoredOverrides | undefined,
	userId: string,
	persisted: CallUnscoredReason | null,
): ResolutionUnscoredReason | null {
	return (
		overrides?.get(userId) ??
		(persisted === "question_voided" ? null : persisted)
	)
}

// What a scoring pass means for each caller, beyond the rows it rewrites.
export type ResolutionTally = {
	// Each caller's net user_season_stats change - see deltaFor.
	statDeltas: Map<string, LeagueStatDelta>
	// What each caller's call is worth after this pass, summed across every
	// selection on a multi-pick award. Not statDeltas' points: on a re-resolve
	// that also nets out the prior, now-wrong award, which is right for the
	// season total but would read as a wildly overstated loss in a "your call
	// missed" notification.
	newPointsByUserId: Map<string, number>
	// The call each scored caller made. calls is unique on (questionId,
	// userId), so one per caller however many selections it carries.
	callIdByUserId: Map<string, string>
	// Callers whose call this pass leaves unscored. There's no result on their
	// call to report.
	unscoredUsers: Set<string>
	// Callers whose call already carried a result before this pass, which is
	// only possible on a re-resolve.
	rescoredUsers: Set<string>
}

function emptyTally(): ResolutionTally {
	return {
		statDeltas: new Map(),
		newPointsByUserId: new Map(),
		callIdByUserId: new Map(),
		unscoredUsers: new Set(),
		rescoredUsers: new Set(),
	}
}

function record(
	tally: ResolutionTally,
	caller: { userId: string; callId: string },
	prior: PriorResult,
	next: NextResult,
	conviction: number,
) {
	addLeagueStatDelta(
		tally.statDeltas,
		caller.userId,
		deltaFor(prior, next, conviction),
	)
	if (!next) {
		tally.unscoredUsers.add(caller.userId)
		return
	}
	tally.newPointsByUserId.set(
		caller.userId,
		(tally.newPointsByUserId.get(caller.userId) ?? 0) + next.points,
	)
	tally.callIdByUserId.set(caller.userId, caller.callId)
	if (prior.resultPoints !== null) tally.rescoredUsers.add(caller.userId)
}

export type GuessCall = {
	id: string
	userId: string
	guessValue: number | null
	conviction: number | null
	resultPoints: number | null
	hitTolerance: boolean | null
	unscoredReason: CallUnscoredReason | null
	createdAt: Date
}

export type GuessCallUpdate = {
	callId: string
	set: {
		resultPoints: number | null
		hitTolerance: boolean | null
		closenessMult: number | null
		closenessFieldPct: number | null
		challengePoints: number | null
		unscoredReason: ResolutionUnscoredReason | null
	}
}

// Scores a numeric-guess question's calls against its final number. Unscored
// calls still count toward the field every other guess is ranked against -
// they were real guesses at lock. A call missing its guess or conviction
// isn't part of the field and is left exactly as it was.
export function scoreGuesses(input: {
	shape: QuestionShape
	isOfficial: boolean
	lossRate: number
	tolerance: ToleranceSpec
	actualValue: number
	calls: GuessCall[]
	unscoredUserIds?: UnscoredOverrides
	// What share of its full points each call is worth, by call - see
	// seasonPlayWeight. A call missing from it is worth all of them.
	weightByCallId?: ReadonlyMap<string, number>
}): { updates: GuessCallUpdate[]; tally: ResolutionTally } {
	const guesses = input.calls
		.filter(
			(c): c is GuessCall & { guessValue: number; conviction: number } =>
				c.guessValue !== null && c.conviction !== null,
		)
		.map((c) => ({
			callId: c.id,
			guessValue: c.guessValue,
			conviction: c.conviction,
			createdAt: c.createdAt,
			weight: input.weightByCallId?.get(c.id),
		}))
	const scored = numericGuessPoints(
		// A numeric guess has no model price.
		basePointsFor({ ...input, isPriced: false }),
		input.lossRate,
		guesses,
		input.actualValue,
		input.tolerance,
	)

	const callsById = new Map(input.calls.map((c) => [c.id, c]))
	const tally = emptyTally()
	const updates: GuessCallUpdate[] = []
	for (const r of scored) {
		const prior = callsById.get(r.callId)
		if (!prior) continue
		const unscoredReason = unscoredReasonFor(
			input.unscoredUserIds,
			prior.userId,
			prior.unscoredReason,
		)
		updates.push({
			callId: r.callId,
			set: unscoredReason
				? {
						resultPoints: null,
						hitTolerance: null,
						closenessMult: null,
						closenessFieldPct: null,
						challengePoints: null,
						unscoredReason,
					}
				: {
						resultPoints: r.points,
						hitTolerance: r.hit,
						closenessMult: r.closenessMult,
						closenessFieldPct: r.closenessFieldPct,
						challengePoints: r.challengePoints,
						unscoredReason: null,
					},
		})
		record(
			tally,
			{ userId: prior.userId, callId: prior.id },
			{
				resultPoints: prior.resultPoints,
				correct: prior.hitTolerance === true,
			},
			unscoredReason ? null : { points: r.points, correct: r.hit === true },
			prior.conviction ?? 0,
		)
	}
	return { updates, tally }
}

export type SelectionToScore = {
	id: string
	optionId: string
	conviction: number
	resultPoints: number | null
	// The side's price when the pick was made - see callSelections.lossRate.
	// All null on an unpriced side.
	lossRate: number | null
	winMult: number | null
	modelHitRate: number | null
	call: {
		id: string
		userId: string
		createdAt: Date
		unscoredReason: CallUnscoredReason | null
	}
}

// Scores every selection on an option-based question, each at the price its
// side had when it was picked. `options` carry isCorrect as persisted before
// this pass - the only record of whether a selection was previously right,
// which an overturn needs to net it out - and whether the question's sides
// are priced now, which sets its base points.
// `selections` are the whole field, unscored calls included: they were real
// picks at lock, so they keep their share of the field's conviction (see
// crowdTotals) and their place in the earliness order. `earliness` says what
// that order is measured against.
export function scoreSelections(input: {
	shape: QuestionShape
	isOfficial: boolean
	lossRate: number
	options: {
		id: string
		isCorrect: boolean | null
		lossRate?: number | null
		winMult?: number | null
		modelHitRate?: number | null
	}[]
	correctOptionIds: string[]
	selections: SelectionToScore[]
	earliness: EarlinessBasis
	unscoredUserIds?: UnscoredOverrides
	// What share of its full points each call is worth, by call - see
	// seasonPlayWeight and seriesStageWeight. A call missing from it is worth
	// all of them.
	weightByCallId?: ReadonlyMap<string, number>
}): {
	selectionPoints: {
		selectionId: string
		resultPoints: number | null
		challengePoints: number | null
	}[]
	callReasons: {
		callId: string
		unscoredReason: ResolutionUnscoredReason | null
	}[]
	tally: ResolutionTally
} {
	const wasCorrectByOptionId = new Map(
		input.options.map((o) => [o.id, o.isCorrect]),
	)
	const basePoints = basePointsFor({
		...input,
		isPriced: isPricedQuestion(input.options),
	})
	const correctOptionIds = new Set(input.correctOptionIds)
	const callsById = new Map(input.selections.map((s) => [s.call.id, s.call]))
	const crowd = crowdTotals(
		input.selections.map((s) => ({
			callId: s.call.id,
			optionId: s.optionId,
			conviction: s.conviction,
		})),
	)
	const earlyMultByCallId = earlinessFor(
		[...callsById.values()],
		input.earliness,
	)

	const tally = emptyTally()
	const points: {
		selectionId: string
		resultPoints: number | null
		challengePoints: number | null
	}[] = []
	for (const s of input.selections) {
		const unscored =
			unscoredReasonFor(
				input.unscoredUserIds,
				s.call.userId,
				s.call.unscoredReason,
			) !== null
		const isCorrect = correctOptionIds.has(s.optionId)
		const pointsFor = (base: number, earlyMult: number) =>
			selectionPoints(
				base,
				effectiveLossRate(input.lossRate, s.lossRate),
				fieldPct(crowd.byOption.get(s.optionId) ?? 0, crowd.field),
				input.options.length,
				s.conviction,
				isCorrect,
				earlyMult,
				{ winMult: s.winMult, modelHitRate: s.modelHitRate },
			)
		const next = unscored
			? null
			: {
					points: pointsFor(
						basePoints * (input.weightByCallId?.get(s.call.id) ?? 1),
						earlyMultByCallId.get(s.call.id) ?? 1,
					),
					correct: isCorrect,
				}
		points.push({
			selectionId: s.id,
			resultPoints: next?.points ?? null,
			// A challenge compares how two people read the question, so neither
			// earliness nor the season-play weight counts toward it.
			challengePoints: unscored ? null : pointsFor(basePoints, 1),
		})
		record(
			tally,
			{ userId: s.call.userId, callId: s.call.id },
			{
				resultPoints: s.resultPoints,
				correct: wasCorrectByOptionId.get(s.optionId) === true,
			},
			next,
			s.conviction,
		)
	}

	const callReasons = [...callsById.values()].flatMap((call) => {
		const unscoredReason = unscoredReasonFor(
			input.unscoredUserIds,
			call.userId,
			call.unscoredReason,
		)
		return unscoredReason === call.unscoredReason
			? []
			: [{ callId: call.id, unscoredReason }]
	})

	return { selectionPoints: points, callReasons, tally }
}

// The callers a resolution has something new to tell, with what their call
// is now worth. A caller left unscored has no result to report, and one whose
// result didn't move (a re-resolve to the same outcome) settled nothing new.
export function notifiedCallers(
	statDeltas: ReadonlyMap<string, LeagueStatDelta>,
	tally: ResolutionTally,
): {
	userId: string
	callId: string | undefined
	pointsDelta: number
	rescored: boolean
}[] {
	return [...statDeltas]
		.filter(
			([userId, d]) =>
				!tally.unscoredUsers.has(userId) &&
				(d.points !== 0 || d.resolvedCallCount !== 0),
		)
		.map(([userId, d]) => ({
			userId,
			callId: tally.callIdByUserId.get(userId),
			pointsDelta: tally.newPointsByUserId.get(userId) ?? d.points,
			rescored: tally.rescoredUsers.has(userId),
		}))
}

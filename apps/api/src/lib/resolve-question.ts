import {
	isNumericGuessShape,
	isOverUnderShape,
	isSeasonLongShape,
} from "@called-my-shot/scoring"
import { and, count, eq, inArray, lte, notInArray } from "drizzle-orm"
import {
	callSelections,
	calls,
	games,
	type Question,
	questionOptions,
	questions,
} from "../db/schema"
import type { Tx } from "../db/types"
import { enqueueAnalyticsEvents } from "./analytics-outbox"
import { reversalDeltas } from "./call-contribution"
import { enqueueResolvedCallEmails } from "./email-outbox"
import { ValidationError } from "./errors"
import { createNotifications } from "./notifications"
import { toleranceSpecFor } from "./numeric-tolerance"
import type { EarlinessBasis } from "./resolution/earliness"
import {
	notifiedCallers,
	type ResolutionTally,
	scoreGuesses,
	scoreSelections,
	type UnscoredOverrides,
} from "./resolution/score"
import { markAchievementsDirty } from "./streaks/enqueue"
import {
	addLeagueStatDelta,
	applySeasonStatDeltas,
	type LeagueStatDelta,
} from "./user-season-stats"

// Who set a question's current result. userId is null only when the creator
// or admin account behind it has since been deleted.
export type ResolvedBy =
	| { method: "system" }
	| { method: "creator" | "admin"; userId: string | null }

export type ResolveOptions = {
	resolvedBy: ResolvedBy
	// Overwrites the creation-time resolutionSource/resolutionSourceUrl with
	// what was actually checked. Admin and automatic resolutions pass it; a
	// creator's never does.
	source?: { resolutionSource?: string; resolutionSourceUrl?: string }
	// Calls to leave unscored, keyed by caller. Merged with any reason already
	// persisted on a call, so an exclusion made at first resolution survives an
	// overturn or admin re-resolve that doesn't pass it again.
	unscoredUserIds?: UnscoredOverrides
}

// The scoring + question-update core of resolving a question - shared by
// resolveQuestion, adminResolveQuestion and overturnDispute
// (graphql/types/question/mutations/resolution.ts) and by the ESPN-driven
// resolvers under db/sync. Deliberately has no auth or status-eligibility
// checks of its own - every caller already had to load, lock and validate
// `question` under its own rules, so re-checking here would just be redundant
// with all of them.
export async function resolveQuestionInternal(
	tx: Tx,
	question: Question,
	data: {
		correctOptionIds: string[]
		// The question's own final number, persisted to numericActualValue for
		// the shapes that have one (see the column). Undefined leaves whatever
		// is already there alone, which is how a manual resolve that supplies
		// no number keeps an earlier automatic one.
		actualValue?: number
		// What each option's subject put up, for the comparison shapes - see
		// questionOptions.actualValue. Options left out keep their current value.
		optionValues?: { optionId: string; value: number }[]
		resolutionNote: string
	},
	opts: ResolveOptions,
) {
	// Each affected user's net user_season_stats change across this call -
	// see deltaFor for why it's a delta rather than new totals.
	const statDeltas = new Map<string, LeagueStatDelta>()

	// Voiding took every call's callCount back out (see markQuestionVoided), so
	// resolving a voided question puts it back.
	if (question.status === "voided") {
		const voidedCalls = await tx.query.calls.findMany({
			where: { questionId: question.id },
			columns: { userId: true },
		})
		for (const call of voidedCalls) {
			addLeagueStatDelta(statDeltas, call.userId, { callCount: 1 })
		}
	}

	const isNumericGuess = isNumericGuessShape(question.shape)
	// Which shapes have a single number as their answer. The numeric guesses
	// are scored against it; an over/under is scored against which side of the
	// line it fell on and keeps it only so the result can state it.
	const storesActualValue = isNumericGuess || isOverUnderShape(question.shape)

	const tally = isNumericGuess
		? await scoreGuessCalls(tx, question, data, opts.unscoredUserIds)
		: await scoreOptionCalls(tx, question, data, opts.unscoredUserIds)
	for (const [userId, delta] of tally.statDeltas) {
		addLeagueStatDelta(statDeltas, userId, delta)
	}

	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		statDeltas,
	)

	const notified = notifiedCallers(statDeltas, tally)

	await createNotifications(
		tx,
		notified.map(({ userId, pointsDelta }) => ({
			type: "call_resolved" as const,
			userId,
			questionId: question.id,
			questionTitle: question.title,
			pointsDelta,
		})),
	)

	// Queued, not sent. This runs inside the caller's transaction, so an
	// inline send would go out before commit and again on any retry; and
	// sync-live-scores resolves a whole slate at once, which for one caller
	// with several open calls would be several emails within the hour. The
	// drain (lib/email-digest.ts) coalesces those into one and is where the
	// opt-out check happens - enqueuing everyone and filtering later is what
	// makes an unsubscribe during the settling window still count.
	await enqueueResolvedCallEmails(
		tx,
		notified.flatMap(({ userId, callId }) =>
			callId ? [{ userId, questionId: question.id, callId }] : [],
		),
	)

	const { resolvedBy, source } = opts

	// The same set that gets a notification: a re-resolve that leaves a call's
	// result where it was settles nothing new, so it isn't counted twice.
	await enqueueAnalyticsEvents(
		tx,
		notified.flatMap(({ userId, callId, pointsDelta, rescored }) =>
			callId
				? [
						{
							event: "call_resolved" as const,
							userId,
							properties: {
								questionId: question.id,
								callId,
								questionShape: question.shape,
								leagueId: question.leagueId,
								sportId: question.sportId,
								horizon: isSeasonLongShape(question.shape)
									? ("season" as const)
									: ("game" as const),
								correct: pointsDelta >= 0,
								pointsDelta,
								resolutionMethod: resolvedBy.method,
								rescored,
							},
						},
					]
				: [],
		),
	)

	await markAchievementsDirty(tx, question)

	const [updated] = await tx
		.update(questions)
		.set({
			status: "resolved",
			voidedReason: null,
			resolvedAt: new Date(),
			resolutionNote: data.resolutionNote || null,
			resolutionMethod: resolvedBy.method,
			resolvedByUserId:
				resolvedBy.method === "system" ? null : resolvedBy.userId,
			...(storesActualValue && data.actualValue !== undefined
				? { numericActualValue: data.actualValue }
				: {}),
			...(source?.resolutionSource
				? { resolutionSource: source.resolutionSource }
				: {}),
			...(source?.resolutionSourceUrl !== undefined
				? { resolutionSourceUrl: source.resolutionSourceUrl || null }
				: {}),
		})
		.where(eq(questions.id, question.id))
		.returning()

	if (!updated)
		throw new Error(
			"resolveQuestionInternal: question vanished mid-transaction",
		)
	return updated
}

// Scores a numeric-guess question's calls and writes each result onto its
// call. resolveQuestionSchema/adminResolveQuestionSchema guarantee
// actualValue is set for these shapes.
async function scoreGuessCalls(
	tx: Tx,
	question: Question,
	data: { actualValue?: number },
	unscoredUserIds: UnscoredOverrides | undefined,
): Promise<ResolutionTally> {
	const guessCalls = await tx.query.calls.findMany({
		where: { questionId: question.id },
		columns: {
			id: true,
			userId: true,
			guessValue: true,
			conviction: true,
			resultPoints: true,
			hitTolerance: true,
			unscoredReason: true,
			createdAt: true,
		},
	})
	const { updates, tally } = scoreGuesses({
		shape: question.shape,
		lossRate: question.lossRate,
		tolerance: toleranceSpecFor(question),
		actualValue: data.actualValue as number,
		calls: guessCalls,
		unscoredUserIds,
	})
	for (const { callId, set } of updates) {
		await tx.update(calls).set(set).where(eq(calls.id, callId))
	}
	return tally
}

// Marks which options were right, then scores every selection on them.
async function scoreOptionCalls(
	tx: Tx,
	question: Question,
	data: {
		correctOptionIds: string[]
		optionValues?: { optionId: string; value: number }[]
	},
	unscoredUserIds: UnscoredOverrides | undefined,
): Promise<ResolutionTally> {
	// Read before the updates below overwrite isCorrect - scoreSelections
	// needs what each option was previously marked.
	const options = await tx.query.questionOptions.findMany({
		where: { questionId: question.id },
		columns: { id: true, isCorrect: true },
	})
	const validIds = new Set(options.map((o) => o.id))
	if (!data.correctOptionIds.every((id) => validIds.has(id))) {
		throw ValidationError.field(
			"correctOptionIds",
			"One or more options don't belong to this question",
		)
	}

	await tx
		.update(questionOptions)
		.set({ isCorrect: true })
		.where(
			and(
				eq(questionOptions.questionId, question.id),
				inArray(questionOptions.id, data.correctOptionIds),
			),
		)
	await tx
		.update(questionOptions)
		.set({ isCorrect: false })
		.where(
			and(
				eq(questionOptions.questionId, question.id),
				notInArray(questionOptions.id, data.correctOptionIds),
			),
		)

	// One statement per option rather than a single set: each option gets a
	// different number, and a head-to-head has two of them while a leader
	// pool has as many as the pool is big, which is still a handful.
	for (const { optionId, value } of data.optionValues ?? []) {
		if (!validIds.has(optionId)) {
			throw ValidationError.field(
				"optionValues",
				"One or more options don't belong to this question",
			)
		}
		await tx
			.update(questionOptions)
			.set({ actualValue: value })
			.where(eq(questionOptions.id, optionId))
	}

	const [{ n: totalCalls }] = await tx
		.select({ n: count() })
		.from(calls)
		.where(eq(calls.questionId, question.id))

	const perOptionCounts = await tx
		.select({ optionId: callSelections.optionId, n: count() })
		.from(callSelections)
		.innerJoin(calls, eq(calls.id, callSelections.callId))
		.where(eq(calls.questionId, question.id))
		.groupBy(callSelections.optionId)

	const rawSelections = await tx.query.callSelections.findMany({
		where: { call: { questionId: question.id } },
		columns: {
			id: true,
			optionId: true,
			conviction: true,
			resultPoints: true,
		},
		with: {
			call: {
				columns: {
					id: true,
					userId: true,
					createdAt: true,
					unscoredReason: true,
				},
			},
		},
	})
	// The `where` above already filters to selections whose call belongs to
	// this question, so `call` is always present here - this narrows the
	// type Drizzle infers (nullable for every `one` relation regardless of
	// FK nullability) rather than reflecting a real possibility.
	const selections = rawSelections.filter(
		(s): s is typeof s & { call: NonNullable<(typeof s)["call"]> } =>
			s.call !== null,
	)

	const earliness: EarlinessBasis = isSeasonLongShape(question.shape)
		? {
				by: "season",
				games: await tx
					.select({ startsAt: games.startsAt, status: games.status })
					.from(games)
					.where(
						and(
							eq(games.seasonId, question.seasonId),
							lte(games.startsAt, question.locksAt),
						),
					),
			}
		: { by: "rank", totalCalls }

	const scored = scoreSelections({
		shape: question.shape,
		lossRate: question.lossRate,
		options,
		correctOptionIds: data.correctOptionIds,
		totalCalls,
		countByOption: new Map(perOptionCounts.map((r) => [r.optionId, r.n])),
		selections,
		earliness,
		unscoredUserIds,
	})

	for (const { selectionId, resultPoints } of scored.selectionPoints) {
		await tx
			.update(callSelections)
			.set({ resultPoints })
			.where(eq(callSelections.id, selectionId))
	}
	for (const { callId, unscoredReason } of scored.callReasons) {
		await tx.update(calls).set({ unscoredReason }).where(eq(calls.id, callId))
	}
	return scored.tally
}

// Takes every call's contribution to user_season_stats back out, ahead of
// voidQuestion/deleteQuestion hard-deleting the question and the calls that
// recorded it. See callContribution for what each call gave: always its
// callCount, plus points/resolvedCallCount/correctCount once it was scored.
// Returns the calls it read, for a caller that goes on to rewrite them.
export async function reverseQuestionLeagueStats(tx: Tx, question: Question) {
	const questionCalls = await tx.query.calls.findMany({
		where: { questionId: question.id },
		columns: {
			id: true,
			userId: true,
			resultPoints: true,
			hitTolerance: true,
			conviction: true,
			unscoredReason: true,
		},
		with: {
			selections: {
				columns: { resultPoints: true, conviction: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})
	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		reversalDeltas(questionCalls, question.status),
	)
	return questionCalls
}

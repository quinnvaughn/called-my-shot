import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	fieldPct,
	isNumericGuessShape,
	isSeasonLongShape,
	numericGuessPoints,
	seasonEarlyTierFor,
	selectionPoints,
	type ToleranceSpec,
} from "@called-my-shot/scoring"
import { and, count, eq, inArray, lte, notInArray } from "drizzle-orm"
import {
	type CallUnscoredReason,
	callSelections,
	calls,
	games,
	type Question,
	questionOptions,
	questions,
} from "../db/schema"
import { callContribution } from "./call-contribution"
import { enqueueResolvedCallEmails } from "./email-outbox"
import { ValidationError } from "./errors"
import { createNotifications } from "./notifications"
import { markAchievementsDirty } from "./streaks/enqueue"
import {
	addLeagueStatDelta,
	applySeasonStatDeltas,
	type LeagueStatDelta,
	type Tx,
} from "./user-season-stats"

// Who set a question's current result. userId is null only when the creator
// or admin account behind it has since been deleted.
export type ResolvedBy =
	| { method: "system" }
	| { method: "creator" | "admin"; userId: string | null }

// A reason the resolution itself leaves a call unscored. question_voided isn't
// one of them - only voiding sets it, and resolving a question clears it.
export type ResolutionUnscoredReason = Exclude<
	CallUnscoredReason,
	"question_voided"
>

export type ResolveOptions = {
	resolvedBy: ResolvedBy
	// Overwrites the creation-time resolutionSource/resolutionSourceUrl with
	// what was actually checked. Admin and automatic resolutions pass it; a
	// creator's never does.
	source?: { resolutionSource?: string; resolutionSourceUrl?: string }
	// Calls to leave unscored, keyed by caller. Merged with any reason already
	// persisted on a call, so an exclusion made at first resolution survives an
	// overturn or admin re-resolve that doesn't pass it again.
	unscoredUserIds?: ReadonlyMap<string, ResolutionUnscoredReason>
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
		actualValue?: number
		resolutionNote: string
	},
	opts: ResolveOptions,
) {
	// Accumulates each affected user's net (points, resolvedCallCount,
	// correctCount) change across this call - not the new totals themselves,
	// since overturnDispute can re-run this against a question that was
	// already resolved once, and the calls/selections below still carry their
	// *previous* values when that happens (there is no reset step). Using
	// (new - old) instead of (new) keeps user_season_stats correct on a
	// re-resolve instead of double-counting the prior award. callCount only
	// moves here when resolving a voided question (see below) - otherwise it
	// changes at castCall and voiding time.
	const statDeltas = new Map<string, LeagueStatDelta>()
	// What each user's call is actually worth after this resolution (summed
	// across every selection on a multi-pick award) - deliberately NOT the
	// same number as statDeltas' points above. On a first-time resolution the
	// two are equal (there was nothing to claw back), but on a re-resolve
	// (overturnDispute) statDeltas' delta also nets out the prior, now-wrong
	// award, which is correct for the season-stats total but reads as a wildly
	// overstated loss in a "your call on X missed" notification - a caller
	// only cares what their call is worth now, not the size of the portfolio
	// swing that got them there.
	const newPointsByUserId = new Map<string, number>()
	// Which call each affected user made on this question, for the email
	// outbox rows below. One entry per user is enough - calls is unique on
	// (questionId, userId), so a user has at most one call here regardless of
	// how many selections it carries.
	const callIdByUserId = new Map<string, string>()
	// Callers whose call this resolution leaves unscored. They get no result
	// notification or email - there's no result on their call to report.
	const unscoredUsers = new Set<string>()

	const unscoredReasonFor = (
		userId: string,
		persisted: CallUnscoredReason | null,
	): ResolutionUnscoredReason | null =>
		opts.unscoredUserIds?.get(userId) ??
		(persisted === "question_voided" ? null : persisted)

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

	if (isNumericGuess) {
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
		// Unscored calls still count toward the field every other guess is
		// ranked against - they were real guesses at lock, whatever happens to
		// their own result.
		const guesses = guessCalls
			.filter(
				(c): c is typeof c & { guessValue: number; conviction: number } =>
					c.guessValue !== null && c.conviction !== null,
			)
			.map((c) => ({
				callId: c.id,
				guessValue: c.guessValue,
				conviction: c.conviction,
				createdAt: c.createdAt,
			}))

		// resolveQuestionSchema/adminResolveQuestionSchema guarantee actualValue
		// is set for the numeric-guess shapes, and createQuestionSchema
		// guarantees exactly one of numericTolerancePct/numericToleranceAbsolute
		// was set at creation for them, matching the picked stat's tolerance
		// tier mode.
		const toleranceSpec: ToleranceSpec =
			question.numericToleranceAbsolute !== null
				? { mode: "absolute", amount: question.numericToleranceAbsolute }
				: { mode: "percentage", pct: question.numericTolerancePct as number }
		const scored = numericGuessPoints(
			BASE_POINTS_BY_SHAPE[question.shape],
			guesses,
			data.actualValue as number,
			toleranceSpec,
		)
		const oldByCallId = new Map(guessCalls.map((c) => [c.id, c]))
		for (const r of scored) {
			const prior = oldByCallId.get(r.callId)
			if (!prior) continue
			const wasResolved = prior.resultPoints !== null
			const wasCorrect = wasResolved && prior.hitTolerance === true
			const unscoredReason = unscoredReasonFor(
				prior.userId,
				prior.unscoredReason,
			)

			if (unscoredReason) {
				await tx
					.update(calls)
					.set({
						resultPoints: null,
						hitTolerance: null,
						closenessMult: null,
						closenessFieldPct: null,
						unscoredReason,
					})
					.where(eq(calls.id, r.callId))
				addLeagueStatDelta(statDeltas, prior.userId, {
					points: -(prior.resultPoints ?? 0),
					resolvedCallCount: wasResolved ? -1 : 0,
					correctCount: wasCorrect ? -1 : 0,
				})
				unscoredUsers.add(prior.userId)
				continue
			}

			await tx
				.update(calls)
				.set({
					resultPoints: r.points,
					hitTolerance: r.hit,
					closenessMult: r.closenessMult,
					closenessFieldPct: r.closenessFieldPct,
					unscoredReason: null,
				})
				.where(eq(calls.id, r.callId))

			const isCorrect = r.hit === true
			addLeagueStatDelta(statDeltas, prior.userId, {
				points: r.points - (prior.resultPoints ?? 0),
				resolvedCallCount: wasResolved ? 0 : 1,
				correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
			})
			newPointsByUserId.set(prior.userId, r.points)
			callIdByUserId.set(prior.userId, r.callId)
		}
	} else {
		const options = await tx.query.questionOptions.findMany({
			where: { questionId: question.id },
			columns: { id: true, isCorrect: true },
		})
		// Captured before the two updates below overwrite isCorrect - the only
		// record of "was this option previously marked correct" (needed for the
		// per-selection correctCount delta on an overturn re-resolve).
		const oldIsCorrectByOptionId = new Map(
			options.map((o) => [o.id, o.isCorrect]),
		)
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
		const countByOption = new Map(perOptionCounts.map((r) => [r.optionId, r.n]))
		const correctOptionIds = new Set(data.correctOptionIds)

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

		// Earliness is a property of the call, not any one selection in it - a
		// player_season_award/team_season_award call's picks all share the same
		// createdAt, so this ranks distinct calls, not selections, before
		// mapping back. Unscored calls keep their place in the order and in the
		// field share above - they were real picks at lock.
		const callsById = new Map(selections.map((s) => [s.call.id, s.call]))
		const orderedCalls = [...callsById.values()].sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		)
		let earlyMultByCallId: Map<string, number>
		if (isSeasonLongShape(question.shape)) {
			// Season-long: earliness is games-played-so-far / total games in the
			// window this question was actually open for, not rank among callers
			// - see seasonEarlyTierFor's doc comment. The window is bounded by
			// this question's own locksAt (not a fixed regular-season cutoff), so
			// it naturally includes postseason games when a creator leaves a
			// question open that far and excludes them when they don't - no
			// regular-vs-postseason branching needed here.
			const seasonGames = await tx
				.select({ startsAt: games.startsAt, status: games.status })
				.from(games)
				.where(
					and(
						eq(games.seasonId, question.seasonId),
						lte(games.startsAt, question.locksAt),
					),
				)
			const totalGames = seasonGames.length
			earlyMultByCallId = new Map(
				orderedCalls.map((c) => {
					const gamesPlayed = seasonGames.filter(
						(g) => g.status === "final" && g.startsAt <= c.createdAt,
					).length
					return [c.id, seasonEarlyTierFor(gamesPlayed, totalGames).mult]
				}),
			)
		} else {
			earlyMultByCallId = new Map(
				orderedCalls.map((c, index) => [
					c.id,
					earlyTierFor(index + 1, totalCalls).mult,
				]),
			)
		}

		for (const s of selections) {
			const wasResolved = s.resultPoints !== null
			const wasCorrect =
				wasResolved && oldIsCorrectByOptionId.get(s.optionId) === true
			const unscoredReason = unscoredReasonFor(
				s.call.userId,
				s.call.unscoredReason,
			)

			if (unscoredReason) {
				await tx
					.update(callSelections)
					.set({ resultPoints: null })
					.where(eq(callSelections.id, s.id))
				addLeagueStatDelta(statDeltas, s.call.userId, {
					points: -(s.resultPoints ?? 0),
					resolvedCallCount: wasResolved ? -1 : 0,
					correctCount: wasCorrect ? -1 : 0,
				})
				unscoredUsers.add(s.call.userId)
				continue
			}

			const pct = fieldPct(countByOption.get(s.optionId) ?? 0, totalCalls)
			const isCorrect = correctOptionIds.has(s.optionId)
			const earlyMult = earlyMultByCallId.get(s.call.id) ?? 1
			const points = selectionPoints(
				BASE_POINTS_BY_SHAPE[question.shape],
				pct,
				options.length,
				s.conviction,
				isCorrect,
				earlyMult,
			)
			await tx
				.update(callSelections)
				.set({ resultPoints: points })
				.where(eq(callSelections.id, s.id))

			addLeagueStatDelta(statDeltas, s.call.userId, {
				points: points - (s.resultPoints ?? 0),
				resolvedCallCount: wasResolved ? 0 : 1,
				correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
			})
			newPointsByUserId.set(
				s.call.userId,
				(newPointsByUserId.get(s.call.userId) ?? 0) + points,
			)
			callIdByUserId.set(s.call.userId, s.call.id)
		}

		for (const call of callsById.values()) {
			const unscoredReason = unscoredReasonFor(call.userId, call.unscoredReason)
			if (unscoredReason === call.unscoredReason) continue
			await tx
				.update(calls)
				.set({ unscoredReason })
				.where(eq(calls.id, call.id))
		}
	}

	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		statDeltas,
	)

	const notified = [...statDeltas].filter(
		([userId, d]) =>
			!unscoredUsers.has(userId) &&
			(d.points !== 0 || d.resolvedCallCount !== 0),
	)

	await createNotifications(
		tx,
		notified.map(([userId, d]) => ({
			type: "call_resolved" as const,
			userId,
			questionId: question.id,
			questionTitle: question.title,
			pointsDelta: newPointsByUserId.get(userId) ?? d.points,
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
		notified.flatMap(([userId]) => {
			const callId = callIdByUserId.get(userId)
			return callId ? [{ userId, questionId: question.id, callId }] : []
		}),
	)

	await markAchievementsDirty(tx, question)

	const { resolvedBy, source } = opts
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
			...(isNumericGuess ? { numericActualValue: data.actualValue } : {}),
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

// Takes every call's contribution to user_season_stats back out, ahead of
// voidQuestion/deleteQuestion hard-deleting the question and the calls that
// recorded it. See callContribution for what each call gave: always its
// callCount, plus points/resolvedCallCount/correctCount once it was scored.
export async function reverseQuestionLeagueStats(tx: Tx, question: Question) {
	const questionCalls = await tx.query.calls.findMany({
		where: { questionId: question.id },
		columns: {
			userId: true,
			resultPoints: true,
			hitTolerance: true,
			unscoredReason: true,
		},
		with: {
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})

	const deltas = new Map<string, LeagueStatDelta>()
	for (const call of questionCalls) {
		const contribution = callContribution(call, question.status)
		addLeagueStatDelta(deltas, call.userId, {
			points: -contribution.points,
			resolvedCallCount: -contribution.resolvedCallCount,
			correctCount: -contribution.correctCount,
			callCount: -contribution.callCount,
		})
	}

	await applySeasonStatDeltas(tx, question.leagueId, question.seasonId, deltas)
}

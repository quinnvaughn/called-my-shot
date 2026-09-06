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
	callSelections,
	calls,
	games,
	type Question,
	questionOptions,
	questions,
} from "../db/schema"
import { ValidationError } from "./errors"
import { createNotifications } from "./notifications"
import {
	addLeagueStatDelta,
	applySeasonStatDeltas,
	type LeagueStatDelta,
	type Tx,
} from "./user-season-stats"

// The scoring + question-update core of resolving a question - shared by the
// creator-only resolveQuestion and the admin-only adminResolveQuestion/
// overturnDispute (graphql/types/question/mutations/resolution.ts).
// Deliberately has no auth or status-eligibility checks of its own - every
// caller already had to load and validate `question` itself (different rules:
// resolveQuestion requires the creator and refuses resolved/disputed,
// adminResolveQuestion is admin-only, overturnDispute specifically requires
// disputed), so re-checking here would just be redundant with all of them.
// sourceOverride is only ever passed by the admin callers - regular creator
// resolution never touches resolutionSource/resolutionSourceUrl. Exported for
// db/sync/sync-live-scores.ts, which resolves a game's team_vs_team question
// straight off ESPN's final score the same way - same "caller already
// validated eligibility" contract applies there too.
export async function resolveQuestionInternal(
	tx: Tx,
	question: Question,
	data: {
		correctOptionIds: string[]
		actualValue?: number
		resolutionNote: string
	},
	sourceOverride?: { resolutionSource?: string; resolutionSourceUrl?: string },
) {
	// Accumulates each affected user's net (points, resolvedCallCount,
	// correctCount) change across this call - not the new totals themselves,
	// since overturnDispute can re-run this against a question that was
	// already resolved once, and the calls/selections below still carry their
	// *previous* values when that happens (there is no reset step). Using
	// (new - old) instead of (new) keeps user_league_stats correct on a
	// re-resolve instead of double-counting the prior award. callCount is
	// never touched here - it only changes at castCall/voidQuestion time.
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
				createdAt: true,
			},
		})
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
		// is set for the two numeric-guess shapes, and createQuestionSchema
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
			await tx
				.update(calls)
				.set({
					resultPoints: r.points,
					hitTolerance: r.hit,
					closenessMult: r.closenessMult,
					closenessFieldPct: r.closenessFieldPct,
				})
				.where(eq(calls.id, r.callId))

			const prior = oldByCallId.get(r.callId)
			if (prior) {
				const wasResolved = prior.resultPoints !== null
				const wasCorrect = wasResolved && prior.hitTolerance === true
				const isCorrect = r.hit === true
				addLeagueStatDelta(statDeltas, prior.userId, {
					points: r.points - (prior.resultPoints ?? 0),
					resolvedCallCount: wasResolved ? 0 : 1,
					correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
				})
				newPointsByUserId.set(prior.userId, r.points)
			}
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
			with: { call: { columns: { id: true, userId: true, createdAt: true } } },
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
		// mapping back.
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

			const wasResolved = s.resultPoints !== null
			const wasCorrect =
				wasResolved && oldIsCorrectByOptionId.get(s.optionId) === true
			addLeagueStatDelta(statDeltas, s.call.userId, {
				points: points - (s.resultPoints ?? 0),
				resolvedCallCount: wasResolved ? 0 : 1,
				correctCount: (isCorrect ? 1 : 0) - (wasCorrect ? 1 : 0),
			})
			newPointsByUserId.set(
				s.call.userId,
				(newPointsByUserId.get(s.call.userId) ?? 0) + points,
			)
		}
	}

	await applySeasonStatDeltas(
		tx,
		question.leagueId,
		question.seasonId,
		statDeltas,
	)

	await createNotifications(
		tx,
		[...statDeltas]
			.filter(([, d]) => d.points !== 0 || d.resolvedCallCount !== 0)
			.map(([userId, d]) => ({
				type: "call_resolved" as const,
				userId,
				questionId: question.id,
				questionTitle: question.title,
				pointsDelta: newPointsByUserId.get(userId) ?? d.points,
			})),
	)

	const [updated] = await tx
		.update(questions)
		.set({
			status: "resolved",
			resolvedAt: new Date(),
			resolutionNote: data.resolutionNote || null,
			...(isNumericGuess ? { numericActualValue: data.actualValue } : {}),
			...(sourceOverride?.resolutionSource
				? { resolutionSource: sourceOverride.resolutionSource }
				: {}),
			...(sourceOverride?.resolutionSourceUrl !== undefined
				? { resolutionSourceUrl: sourceOverride.resolutionSourceUrl || null }
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

// Called by voidQuestion for every question it voids, regardless of status -
// callCount always needs decrementing for each caller (an `open` question
// can already have calls cast on it), while points/resolvedCallCount/
// correctCount only come out non-zero when calls had already been scored,
// i.e. a `disputed` question (the only status reachable after
// resolveQuestionInternal has already run). Reads whatever's currently on
// the calls/selections before the cascade delete removes them and un-applies
// it from user_league_stats, so a voided-after-dispute question doesn't
// leave stale points/accuracy behind.
export async function reverseQuestionLeagueStats(tx: Tx, question: Question) {
	const questionCalls = await tx.query.calls.findMany({
		where: { questionId: question.id },
		columns: { userId: true, resultPoints: true, hitTolerance: true },
		with: {
			selections: {
				columns: { resultPoints: true },
				with: { option: { columns: { isCorrect: true } } },
			},
		},
	})

	const deltas = new Map<string, LeagueStatDelta>()
	for (const call of questionCalls) {
		let points = 0
		let resolvedCallCount = 0
		let correctCount = 0
		if (call.selections.length > 0) {
			for (const s of call.selections) {
				if (s.resultPoints === null) continue
				points += s.resultPoints
				resolvedCallCount += 1
				if (s.option?.isCorrect) correctCount += 1
			}
		} else if (call.resultPoints !== null) {
			points += call.resultPoints
			resolvedCallCount += 1
			if (call.hitTolerance) correctCount += 1
		}
		addLeagueStatDelta(deltas, call.userId, {
			points: -points,
			resolvedCallCount: -resolvedCallCount,
			correctCount: -correctCount,
			callCount: -1,
		})
	}

	await applySeasonStatDeltas(tx, question.leagueId, question.seasonId, deltas)
}

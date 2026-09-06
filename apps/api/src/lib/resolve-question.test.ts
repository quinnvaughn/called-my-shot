import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	selectionPoints,
	tierFor,
} from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	callSelections,
	notifications,
	type Question,
	questionOptions,
	questionVoids,
	userSeasonStats,
} from "../db/schema"
import {
	makeCall,
	makeGame,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../test/factories"
import {
	resolveQuestionInternal,
	reverseQuestionLeagueStats,
} from "./resolve-question"

/** resolveQuestionInternal takes a tx, so every call goes through one. */
function resolve(
	question: Question,
	data: {
		correctOptionIds?: string[]
		actualValue?: number
		resolutionNote?: string
	},
	sourceOverride?: { resolutionSource?: string; resolutionSourceUrl?: string },
) {
	return db.transaction((tx) =>
		resolveQuestionInternal(
			tx,
			question,
			{
				correctOptionIds: data.correctOptionIds ?? [],
				actualValue: data.actualValue,
				resolutionNote: data.resolutionNote ?? "",
			},
			sourceOverride,
		),
	)
}

const statsFor = (userId: string) =>
	db.query.userSeasonStats.findFirst({ where: { userId } })

const selectionFor = (id: string) =>
	db.query.callSelections.findFirst({ where: { id } })

describe("resolveQuestionInternal - option-based shapes", () => {
	it("marks the question resolved and stamps the note", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const updated = await resolve(question, {
			correctOptionIds: [options[0].id],
			resolutionNote: "Confirmed on the box score",
		})
		expect(updated.status).toBe("resolved")
		expect(updated.resolvedAt).toBeInstanceOf(Date)
		expect(updated.resolutionNote).toBe("Confirmed on the box score")
	})

	it("stores an empty note as null rather than an empty string", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const updated = await resolve(question, {
			correctOptionIds: [options[0].id],
		})
		expect(updated.resolutionNote).toBeNull()
	})

	it("flags exactly the correct options and clears the rest", async () => {
		const { question, options } = await seedOptionQuestion({
			optionLabels: ["A", "B", "C"],
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[1].id] })
		const rows = await db.query.questionOptions.findMany({
			where: { questionId: question.id },
		})
		const byId = new Map(rows.map((r) => [r.id, r.isCorrect]))
		expect(byId.get(options[0].id)).toBe(false)
		expect(byId.get(options[1].id)).toBe(true)
		expect(byId.get(options[2].id)).toBe(false)
	})

	it("rejects a correct option that belongs to another question", async () => {
		const { question } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const other = await makeQuestion()
		const foreign = await makeOption(other.id)
		await expect(
			resolve(question, { correctOptionIds: [foreign.id] }),
		).rejects.toThrow(/don't belong to this question/)
	})

	it("pays a winner and charges a loser", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const winner = await selectionFor(callers[0].selection.id)
		const loser = await selectionFor(callers[1].selection.id)
		expect(winner?.resultPoints).toBeGreaterThan(0)
		expect(loser?.resultPoints).toBe(-BASE_POINTS_BY_SHAPE.yes_no_prop)
	})

	it("matches the shared scoring formula exactly", async () => {
		// Two callers, one on each side: the winner's option holds 50% of the
		// field, and they called first of two.
		const early = pastDate(2)
		const late = pastDate(1)
		const { question, options, callers } = await seedOptionQuestion({
			callers: [
				{ optionIndex: 0, createdAt: early },
				{ optionIndex: 1, createdAt: late },
			],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const expected = selectionPoints(
			BASE_POINTS_BY_SHAPE.yes_no_prop,
			50,
			2,
			100,
			true,
			earlyTierFor(1, 2).mult,
		)
		const winner = await selectionFor(callers[0].selection.id)
		expect(winner?.resultPoints).toBe(expected)
	})

	it("pays a contrarian winner more than a consensus winner", async () => {
		// Ten callers either way, and in both cases the caller under test is
		// first - so earliness is identical and the only thing that differs is
		// how lopsided the field was. A 10-caller field is needed to get a real
		// contrarian split: 1-of-4 is still an even-ish share of a 2-option
		// question and floors at 1x.
		const nine = (optionIndex: number) =>
			Array.from({ length: 9 }, () => ({ optionIndex }))

		const consensus = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, ...nine(0)],
		})
		await resolve(consensus.question, {
			correctOptionIds: [consensus.options[0].id],
		})

		const contrarian = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, ...nine(1)],
		})
		await resolve(contrarian.question, {
			correctOptionIds: [contrarian.options[0].id],
		})

		const safe = await selectionFor(consensus.callers[0].selection.id)
		const bold = await selectionFor(contrarian.callers[0].selection.id)
		expect(bold?.resultPoints).toBeGreaterThan(safe?.resultPoints ?? 0)
	})

	it("scales a win by conviction", async () => {
		// Two questions rather than two callers on one: conviction and rank
		// both feed the final number, so the caller under test has to sit at
		// the same rank in the same-shaped field for this to isolate conviction.
		async function winnerPoints(conviction: number) {
			const { question, options, callers } = await seedOptionQuestion({
				callers: [{ optionIndex: 0, conviction }, { optionIndex: 1 }],
			})
			await resolve(question, { correctOptionIds: [options[0].id] })
			return (await selectionFor(callers[0].selection.id))?.resultPoints ?? 0
		}
		// Compared against the shared formula rather than against each other:
		// points are rounded once, at the end, so half-conviction is not
		// exactly round(full / 2).
		const expected = (conviction: number) =>
			selectionPoints(
				BASE_POINTS_BY_SHAPE.yes_no_prop,
				50,
				2,
				conviction,
				true,
				earlyTierFor(1, 2).mult,
			)
		expect(await winnerPoints(100)).toBe(expected(100))
		expect(await winnerPoints(50)).toBe(expected(50))
		expect(expected(50)).toBeLessThan(expected(100))
	})

	it("scales a loss by conviction alone", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1, conviction: 40 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		const loser = await selectionFor(callers[1].selection.id)
		expect(loser?.resultPoints).toBe(
			-Math.round(BASE_POINTS_BY_SHAPE.yes_no_prop * 0.4),
		)
	})

	it("ranks earliness by call, so an award's picks share one multiplier", async () => {
		const question = await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			awardName: "MVP",
			picksRequired: 2,
		})
		const a = await makeOption(question.id, { label: "A" })
		const b = await makeOption(question.id, { label: "B" })
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			createdAt: pastDate(2),
		})
		const pickA = await makeSelection(call.id, a.id, 100)
		const pickB = await makeSelection(call.id, b.id, 100)

		await resolve(question, { correctOptionIds: [a.id, b.id] })

		// Both picks were made at the same instant on the same call, so they
		// carry the same field share and the same earliness - identical points.
		const scoredA = await selectionFor(pickA.id)
		const scoredB = await selectionFor(pickB.id)
		expect(scoredA?.resultPoints).toBe(scoredB?.resultPoints)
		expect(scoredA?.resultPoints).toBeGreaterThan(0)
	})
})

describe("resolveQuestionInternal - user season stats", () => {
	it("creates a row for a user with no prior activity that season", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const stats = await statsFor(callers[0].user.id)
		expect(stats).toBeTruthy()
		expect(stats?.leagueId).toBe(question.leagueId)
		expect(stats?.seasonId).toBe(question.seasonId)
		expect(stats?.resolvedCallCount).toBe(1)
		expect(stats?.correctCount).toBe(1)
		expect(stats?.points).toBeGreaterThan(0)
	})

	it("counts a loss as resolved but not correct", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const stats = await statsFor(callers[0].user.id)
		expect(stats?.resolvedCallCount).toBe(1)
		expect(stats?.correctCount).toBe(0)
		expect(stats?.points).toBeLessThan(0)
	})

	it("never touches callCount - that only moves at cast time", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		expect((await statsFor(callers[0].user.id))?.callCount).toBe(0)
	})

	it("counts picks rather than calls on a multi-pick award", async () => {
		const question = await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			picksRequired: 2,
		})
		const a = await makeOption(question.id, { label: "A" })
		const b = await makeOption(question.id, { label: "B" })
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		await makeSelection(call.id, a.id)
		await makeSelection(call.id, b.id)

		await resolve(question, { correctOptionIds: [a.id] })

		const stats = await statsFor(user.id)
		expect(stats?.resolvedCallCount).toBe(2)
		expect(stats?.correctCount).toBe(1)
	})

	it("accumulates across two questions in the same season", async () => {
		const user = await makeUser()
		const first = await seedOptionQuestion({ callers: [] })
		const second = await makeQuestion({
			leagueId: first.question.leagueId,
			seasonId: first.question.seasonId,
			sportId: first.question.sportId,
		})
		const secondOption = await makeOption(second.id, { label: "Yes" })

		const callA = await makeCall(first.question.id, user.id)
		await makeSelection(callA.id, first.options[0].id)
		const callB = await makeCall(second.id, user.id)
		await makeSelection(callB.id, secondOption.id)

		await resolve(first.question, { correctOptionIds: [first.options[0].id] })
		await resolve(second, { correctOptionIds: [secondOption.id] })

		const rows = await db
			.select()
			.from(userSeasonStats)
			.where(eq(userSeasonStats.userId, user.id))
		expect(rows).toHaveLength(1)
		expect(rows[0].resolvedCallCount).toBe(2)
		expect(rows[0].correctCount).toBe(2)
	})
})

describe("resolveQuestionInternal - re-resolution (dispute overturn)", () => {
	it("applies the delta, not the new total, so points don't double-count", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		const afterFirst = await statsFor(callers[0].user.id)

		// Same outcome again - the totals must not move at all.
		await resolve(question, { correctOptionIds: [options[0].id] })
		const afterSecond = await statsFor(callers[0].user.id)

		expect(afterSecond?.points).toBe(afterFirst?.points)
		expect(afterSecond?.resolvedCallCount).toBe(1)
		expect(afterSecond?.correctCount).toBe(1)
	})

	it("claws back the prior award when the outcome flips", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		const winnerBefore = await statsFor(callers[0].user.id)
		expect(winnerBefore?.points).toBeGreaterThan(0)
		expect(winnerBefore?.correctCount).toBe(1)

		await resolve(question, { correctOptionIds: [options[1].id] })

		const winnerAfter = await statsFor(callers[0].user.id)
		const loserAfter = await statsFor(callers[1].user.id)
		// The formerly-correct caller now holds the flat loss, with the old
		// win fully netted out - not the win still sitting there alongside it.
		expect(winnerAfter?.points).toBe(-BASE_POINTS_BY_SHAPE.yes_no_prop)
		expect(winnerAfter?.correctCount).toBe(0)
		expect(winnerAfter?.resolvedCallCount).toBe(1)
		expect(loserAfter?.correctCount).toBe(1)
		expect(loserAfter?.points).toBeGreaterThan(0)
	})

	it("notifies with what the call is worth now, not the portfolio swing", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await db.delete(notifications)
		await resolve(question, { correctOptionIds: [options[1].id] })

		const rows = await db.query.notifications.findMany({
			where: { userId: callers[0].user.id },
		})
		expect(rows).toHaveLength(1)
		// The stats delta here is roughly -2x the base (clawing back a win and
		// applying a loss); the notification must read as the plain loss.
		expect(rows[0].pointsDelta).toBe(-BASE_POINTS_BY_SHAPE.yes_no_prop)
	})
})

describe("resolveQuestionInternal - numeric guess shapes", () => {
	async function seedNumeric(
		guesses: { value: number; conviction?: number; hoursAgo?: number }[],
	) {
		const question = await makeQuestion({
			shape: "player_stat_numeric_guess",
			numericTolerancePct: 0.1,
		})
		const callers = []
		for (const [i, g] of guesses.entries()) {
			const user = await makeUser()
			const call = await makeCall(question.id, user.id, {
				guessValue: g.value,
				conviction: g.conviction ?? 100,
				createdAt: pastDate(g.hoursAgo ?? guesses.length - i),
			})
			callers.push({ user, call })
		}
		return { question, callers }
	}

	it("stores the actual value and scores hits and misses", async () => {
		const { question, callers } = await seedNumeric([
			{ value: 100 },
			{ value: 500 },
		])
		const updated = await resolve(question, { actualValue: 100 })
		expect(updated.numericActualValue).toBe(100)

		const hit = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		const miss = await db.query.calls.findFirst({
			where: { id: callers[1].call.id },
		})
		expect(hit?.hitTolerance).toBe(true)
		expect(hit?.resultPoints).toBeGreaterThan(0)
		expect(miss?.hitTolerance).toBe(false)
		expect(miss?.resultPoints).toBe(
			-BASE_POINTS_BY_SHAPE.player_stat_numeric_guess,
		)
	})

	it("persists the closeness multiplier and the raw share behind it", async () => {
		const { question, callers } = await seedNumeric([
			{ value: 100 },
			{ value: 500 },
			{ value: 600 },
			{ value: 700 },
		])
		await resolve(question, { actualValue: 100 })

		const hit = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(hit?.closenessFieldPct).toBe(25)
		expect(hit?.closenessMult).toBeCloseTo(tierFor(25, 2).mult, 2)
	})

	it("leaves closeness null on a miss", async () => {
		const { question, callers } = await seedNumeric([{ value: 500 }])
		await resolve(question, { actualValue: 100 })
		const miss = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(miss?.closenessMult).toBeNull()
		expect(miss?.closenessFieldPct).toBeNull()
	})

	it("reads the absolute tolerance column when that's the one set", async () => {
		const question = await makeQuestion({
			shape: "player_stat_numeric_guess",
			numericToleranceAbsolute: 0.02,
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			guessValue: 0.29,
			conviction: 100,
		})
		await resolve(question, { actualValue: 0.3 })
		const scored = await db.query.calls.findFirst({ where: { id: call.id } })
		// |0.29 - 0.30| = 0.01, inside the 0.02 band; a percentage reading of
		// the same number would have floored the band to 1 and hit trivially.
		expect(scored?.hitTolerance).toBe(true)
	})

	it("does not touch callSelections for a numeric question", async () => {
		const { question } = await seedNumeric([{ value: 100 }])
		await resolve(question, { actualValue: 100 })
		expect(await db.select().from(callSelections)).toHaveLength(0)
	})

	it("updates season stats off the call, not selections", async () => {
		const { question, callers } = await seedNumeric([{ value: 100 }])
		await resolve(question, { actualValue: 100 })
		const stats = await statsFor(callers[0].user.id)
		expect(stats?.resolvedCallCount).toBe(1)
		expect(stats?.correctCount).toBe(1)
	})
})

describe("resolveQuestionInternal - season-long earliness", () => {
	it("scores earliness off games played, not rank among callers", async () => {
		// Two callers on a season-long shape. The first calls before any game
		// is final, the second after 8 of 10 - rank would have given the
		// second caller the worse multiplier anyway, so the test pins the
		// actual season-progress values instead.
		const question = await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			picksRequired: 1,
			locksAt: pastDate(1),
		})
		const option = await makeOption(question.id, { label: "A" })

		for (let i = 0; i < 10; i++) {
			await makeGame({
				leagueId: question.leagueId,
				seasonId: question.seasonId,
				startsAt: pastDate(100 - i * 5),
				status: i < 8 ? "final" : "scheduled",
			})
		}

		const earlyUser = await makeUser()
		const earlyCall = await makeCall(question.id, earlyUser.id, {
			createdAt: pastDate(120),
		})
		const earlyPick = await makeSelection(earlyCall.id, option.id)

		const lateUser = await makeUser()
		const lateCall = await makeCall(question.id, lateUser.id, {
			createdAt: pastDate(55),
		})
		const latePick = await makeSelection(lateCall.id, option.id)

		await resolve(question, { correctOptionIds: [option.id] })

		const early = await selectionFor(earlyPick.id)
		const late = await selectionFor(latePick.id)
		// Called before a single game was played vs. after most of the window.
		expect(early?.resultPoints).toBeGreaterThan(late?.resultPoints ?? 0)
	})

	it("counts only games inside the question's own window", async () => {
		const question = await makeQuestion({
			shape: "player_season_award",
			isOfficial: true,
			locksAt: pastDate(50),
		})
		const option = await makeOption(question.id, { label: "A" })
		// Well after locksAt - must not count toward the window at all.
		await makeGame({
			leagueId: question.leagueId,
			seasonId: question.seasonId,
			startsAt: pastDate(1),
			status: "final",
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			createdAt: pastDate(200),
		})
		const pick = await makeSelection(call.id, option.id)

		await resolve(question, { correctOptionIds: [option.id] })

		// Zero games inside the window means a fully-preseason 3x multiplier.
		const scored = await selectionFor(pick.id)
		expect(scored?.resultPoints).toBe(
			Math.round(
				BASE_POINTS_BY_SHAPE.player_season_award * 1 * tierFor(100, 1).mult * 3,
			),
		)
	})
})

describe("resolveQuestionInternal - notifications and source overrides", () => {
	it("notifies every scored caller once", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		const rows = await db.query.notifications.findMany({
			where: { questionId: question.id },
		})
		expect(rows).toHaveLength(2)
		expect(new Set(rows.map((r) => r.type))).toEqual(new Set(["call_resolved"]))
	})

	it("notifies nobody when a question resolves with no calls", async () => {
		const { question, options } = await seedOptionQuestion({ callers: [] })
		await resolve(question, { correctOptionIds: [options[0].id] })
		expect(await db.query.notifications.findMany()).toHaveLength(0)
	})

	it("leaves the source alone for a normal creator resolution", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const updated = await resolve(question, {
			correctOptionIds: [options[0].id],
		})
		expect(updated.resolutionSource).toBe("Box score")
	})

	it("overwrites the source when an admin passes one", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const updated = await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{
				resolutionSource: "Official league release",
				resolutionSourceUrl: "https://nba.com/x",
			},
		)
		expect(updated.resolutionSource).toBe("Official league release")
		expect(updated.resolutionSourceUrl).toBe("https://nba.com/x")
	})

	it("clears the URL when an admin passes an empty one", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { resolutionSourceUrl: "https://old.example" },
		})
		const updated = await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{ resolutionSourceUrl: "" },
		)
		expect(updated.resolutionSourceUrl).toBeNull()
	})
})

describe("reverseQuestionLeagueStats", () => {
	it("undoes a resolved question's contribution to season stats", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		expect((await statsFor(callers[0].user.id))?.points).toBeGreaterThan(0)

		await db.transaction((tx) => reverseQuestionLeagueStats(tx, question))

		for (const caller of callers) {
			const stats = await statsFor(caller.user.id)
			expect(stats?.points).toBe(0)
			expect(stats?.resolvedCallCount).toBe(0)
			expect(stats?.correctCount).toBe(0)
		}
	})

	it("still reverses callCount for an unresolved question", async () => {
		// A void on an open question: nothing was ever scored, but the cast
		// itself still has to come back off.
		const { question, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await db.insert(userSeasonStats).values({
			userId: callers[0].user.id,
			leagueId: question.leagueId,
			seasonId: question.seasonId,
			callCount: 1,
		})

		await db.transaction((tx) => reverseQuestionLeagueStats(tx, question))

		const stats = await statsFor(callers[0].user.id)
		expect(stats?.callCount).toBe(0)
	})
})

describe("transactional integrity", () => {
	it("leaves nothing behind when the transaction throws", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await expect(
			db.transaction(async (tx) => {
				await resolveQuestionInternal(
					tx,
					question,
					{ correctOptionIds: [options[0].id], resolutionNote: "" },
					undefined,
				)
				throw new Error("caller blew up after resolving")
			}),
		).rejects.toThrow("caller blew up after resolving")

		const after = await db.query.questions.findFirst({
			where: { id: question.id },
		})
		expect(after?.status).toBe("open")
		expect(await statsFor(callers[0].user.id)).toBeUndefined()
		expect(await db.query.notifications.findMany()).toHaveLength(0)
		const option = await db
			.select()
			.from(questionOptions)
			.where(eq(questionOptions.id, options[0].id))
		expect(option[0].isCorrect).toBeNull()
		expect(await db.select().from(questionVoids)).toHaveLength(0)
	})
})

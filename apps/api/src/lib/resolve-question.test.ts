import {
	basePointsFor,
	earlyTierFor,
	LOSS_RATE_BY_SHAPE,
	pointsAtStake,
	selectionPoints,
	tierFor,
} from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	analyticsOutbox,
	callSelections,
	calls,
	emailOutbox,
	notifications,
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
	makeUserSeasonStats,
	pastDate,
	seedOptionQuestion,
} from "../test/factories"
import { resolve } from "../test/helpers"
import { selectionFor, soleCaller, statsFor } from "./resolution/test-support"
import {
	resolveQuestionInternal,
	reverseQuestionLeagueStats,
} from "./resolve-question"

// The factories make community questions unless told otherwise.
const YES_NO_BASE = basePointsFor({ shape: "yes_no_prop", isOfficial: false })

// What a full-conviction miss on a yes/no question costs.
const FULL_MISS = -pointsAtStake(
	YES_NO_BASE,
	LOSS_RATE_BY_SHAPE.yes_no_prop,
	100,
)

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
		expect(loser?.resultPoints).toBe(FULL_MISS)
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
			YES_NO_BASE,
			LOSS_RATE_BY_SHAPE.yes_no_prop,
			50,
			2,
			100,
			true,
			earlyTierFor(1, 2).mult,
		)
		const winner = await selectionFor(callers[0].selection.id)
		expect(winner?.resultPoints).toBe(expected)
	})

	it("costs a redone call its earliness, which is the price of a redo", async () => {
		// Two callers on the same winning side, so field share and everything
		// else is identical and earliness is the only thing separating them.
		// The first caller then redoes, re-stamping createdAt to now, which
		// drops them behind the second.
		const { question, options, callers } = await seedOptionQuestion({
			callers: [
				{ optionIndex: 0, createdAt: pastDate(3) },
				{ optionIndex: 0, createdAt: pastDate(2) },
			],
		})

		await db
			.update(calls)
			.set({ createdAt: new Date() })
			.where(eq(calls.id, callers[0].call.id))

		await resolve(question, { correctOptionIds: [options[0].id] })

		const redone = await selectionFor(callers[0].selection.id)
		const untouched = await selectionFor(callers[1].selection.id)

		// Whoever called first of two keeps the better multiplier - and after
		// the re-stamp that is no longer the caller who originally was first.
		expect(untouched?.resultPoints).toBe(
			selectionPoints(
				YES_NO_BASE,
				LOSS_RATE_BY_SHAPE.yes_no_prop,
				100,
				2,
				100,
				true,
				earlyTierFor(1, 2).mult,
			),
		)
		expect(redone?.resultPoints).toBe(
			selectionPoints(
				YES_NO_BASE,
				LOSS_RATE_BY_SHAPE.yes_no_prop,
				100,
				2,
				100,
				true,
				earlyTierFor(2, 2).mult,
			),
		)
		expect(redone?.resultPoints).toBeLessThan(untouched?.resultPoints ?? 0)
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

	it("banks conviction behind a hit on both sums", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0, conviction: 80 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const stats = await statsFor(callers[0].user.id)
		expect(stats?.convictionSum).toBe(80)
		expect(stats?.convictionSumCorrect).toBe(80)
	})

	it("banks conviction behind a miss on the total sum only", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 1, conviction: 35 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const stats = await statsFor(callers[0].user.id)
		expect(stats?.convictionSum).toBe(35)
		expect(stats?.convictionSumCorrect).toBe(0)
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
		expect(winnerAfter?.points).toBe(FULL_MISS)
		expect(winnerAfter?.correctCount).toBe(0)
		expect(winnerAfter?.resolvedCallCount).toBe(1)
		expect(loserAfter?.correctCount).toBe(1)
		expect(loserAfter?.points).toBeGreaterThan(0)
	})

	it("returns the conviction sums to zero across resolve, overturn and reverse", async () => {
		// The invariant the whole delta design rests on: every path that adds
		// to these sums has a mirror that takes exactly the same amount back
		// out, so a question's entire lifecycle nets to nothing.
		const { question, options, callers } = await seedOptionQuestion({
			callers: [
				{ optionIndex: 0, conviction: 90 },
				{ optionIndex: 1, conviction: 20 },
			],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await resolve(question, { correctOptionIds: [options[1].id] })
		await db.transaction((tx) => reverseQuestionLeagueStats(tx, question))

		for (const caller of callers) {
			const stats = await statsFor(caller.user.id)
			expect(stats?.convictionSum).toBe(0)
			expect(stats?.convictionSumCorrect).toBe(0)
			expect(stats?.resolvedCallCount).toBe(0)
			expect(stats?.correctCount).toBe(0)
		}
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
		expect(rows[0].pointsDelta).toBe(FULL_MISS)
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
			-basePointsFor({
				shape: "player_stat_numeric_guess",
				isOfficial: false,
			}) *
				LOSS_RATE_BY_SHAPE.player_stat_numeric_guess,
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

	it("reads conviction off the call too, for both sums", async () => {
		const { question, callers } = await seedNumeric([
			{ value: 100, conviction: 75 },
			{ value: 5000, conviction: 25 },
		])
		await resolve(question, { actualValue: 100 })

		const hit = await statsFor(callers[0].user.id)
		expect(hit?.convictionSum).toBe(75)
		expect(hit?.convictionSumCorrect).toBe(75)

		const miss = await statsFor(callers[1].user.id)
		expect(miss?.convictionSum).toBe(25)
		expect(miss?.convictionSumCorrect).toBe(0)
	})
})

describe("resolveQuestionInternal - season-long earliness", () => {
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
				basePointsFor({ shape: "player_season_award", isOfficial: true }) * 1 * tierFor(100, 1).mult * 3,
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

	it("tells a game's callers once per game, unread again as each call settles", async () => {
		const game = await makeGame()
		const user = await makeUser()
		const settle = async () => {
			const question = await makeQuestion({
				gameId: game.id,
				leagueId: game.leagueId,
				seasonId: game.seasonId,
			})
			const yes = await makeOption(question.id, { label: "Yes" })
			const call = await makeCall(question.id, user.id)
			await makeSelection(call.id, yes.id)
			await resolve(question, { correctOptionIds: [yes.id] })
		}
		const rowsFor = () =>
			db.query.notifications.findMany({ where: { userId: user.id } })

		await settle()
		const [first, ...rest] = await rowsFor()
		expect(rest).toHaveLength(0)
		expect(first).toMatchObject({ type: "game_resolved", gameId: game.id })

		const readAt = pastDate(1)
		await db
			.update(notifications)
			.set({ readAt, createdAt: readAt })
			.where(eq(notifications.id, first.id))

		await settle()
		const [again, ...more] = await rowsFor()
		expect(more).toHaveLength(0)
		expect(again.id).toBe(first.id)
		expect(again.readAt).toBeNull()
		expect(again.createdAt.getTime()).toBeGreaterThan(readAt.getTime())
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
				source: {
					resolutionSource: "Official league release",
					resolutionSourceUrl: "https://nba.com/x",
				},
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
			{ source: { resolutionSourceUrl: "" } },
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
		await makeUserSeasonStats({
			userId: callers[0].user.id,
			leagueId: question.leagueId,
			seasonId: question.seasonId,
			callCount: 1,
		})

		await db.transaction((tx) => reverseQuestionLeagueStats(tx, question))

		const stats = await statsFor(callers[0].user.id)
		expect(stats?.callCount).toBe(0)
	})

	it("reverses only callCount for an unscored call", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const userId = callers[0].user.id
		await makeUserSeasonStats({
			userId,
			leagueId: question.leagueId,
			seasonId: question.seasonId,
			callCount: 1,
		})
		await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{ unscoredUserIds: soleCaller(userId) },
		)

		await db.transaction((tx) => reverseQuestionLeagueStats(tx, question))

		const stats = await statsFor(userId)
		expect(stats?.callCount).toBe(0)
		expect(stats?.points).toBe(0)
		expect(stats?.resolvedCallCount).toBe(0)
	})
})

describe("resolveQuestionInternal - resolution method", () => {
	it("stamps the creator who resolved it", async () => {
		const creator = await makeUser()
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
			question: { creatorId: creator.id },
		})
		const updated = await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{ resolvedBy: { method: "creator", userId: creator.id } },
		)
		expect(updated.resolutionMethod).toBe("creator")
		expect(updated.resolvedByUserId).toBe(creator.id)
	})

	it("records no person behind a system resolution", async () => {
		const { question, options } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const updated = await resolve(question, {
			correctOptionIds: [options[0].id],
		})
		expect(updated.resolutionMethod).toBe("system")
		expect(updated.resolvedByUserId).toBeNull()
	})
})

describe("resolveQuestionInternal - unscored calls", () => {
	it("leaves an excluded call unscored and out of every stat", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const userId = callers[0].user.id
		await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{ unscoredUserIds: soleCaller(userId) },
		)

		expect(
			(await selectionFor(callers[0].selection.id))?.resultPoints,
		).toBeNull()
		const call = await db.query.calls.findFirst({
			where: { id: callers[0].call.id },
		})
		expect(call?.unscoredReason).toBe("creator_sole_caller")
		expect(await statsFor(userId)).toBeUndefined()
		expect(await db.query.notifications.findMany()).toHaveLength(0)
		expect(await db.select().from(emailOutbox)).toHaveLength(0)
	})

	it("keeps a persisted exclusion when re-resolved without it", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		const userId = callers[0].user.id
		await resolve(
			question,
			{ correctOptionIds: [options[1].id] },
			{ unscoredUserIds: soleCaller(userId) },
		)
		await resolve(question, { correctOptionIds: [options[0].id] })

		expect(
			(await selectionFor(callers[0].selection.id))?.resultPoints,
		).toBeNull()
		expect(await statsFor(userId)).toBeUndefined()
	})

	it("leaves an excluded numeric guess unscored", async () => {
		const question = await makeQuestion({
			shape: "player_stat_numeric_guess",
			numericTolerancePct: 0.1,
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			guessValue: 100,
			conviction: 100,
		})
		await resolve(
			question,
			{ actualValue: 100 },
			{ unscoredUserIds: soleCaller(user.id) },
		)

		const scored = await db.query.calls.findFirst({ where: { id: call.id } })
		expect(scored?.resultPoints).toBeNull()
		expect(scored?.hitTolerance).toBeNull()
		expect(scored?.closenessMult).toBeNull()
		expect(scored?.unscoredReason).toBe("creator_sole_caller")
		expect(await statsFor(user.id)).toBeUndefined()
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
					{ resolvedBy: { method: "system" } },
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

describe("resolveQuestionInternal - call_resolved analytics", () => {
	const eventsFor = (userId: string) =>
		db.query.analyticsOutbox.findMany({ where: { userId } })

	it("queues one event per scored caller with league, sport and result", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const [won] = await eventsFor(callers[0].user.id)
		const [lost] = await eventsFor(callers[1].user.id)
		expect(won.event).toBe("call_resolved")
		expect(won.properties).toMatchObject({
			questionId: question.id,
			callId: callers[0].call.id,
			questionShape: "yes_no_prop",
			leagueId: question.leagueId,
			sportId: question.sportId,
			horizon: "game",
			correct: true,
			resolutionMethod: "system",
			rescored: false,
		})
		expect(
			(won.properties as { pointsDelta: number }).pointsDelta,
		).toBeGreaterThan(0)
		expect(lost.properties).toMatchObject({
			correct: false,
			pointsDelta: FULL_MISS,
		})
	})

	it("marks a season-long question's calls with the season horizon", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			shape: "player_season_award",
			callers: [{ optionIndex: 0 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })

		const [event] = await eventsFor(callers[0].user.id)
		expect(event.properties).toMatchObject({ horizon: "season" })
	})

	it("queues nothing for a caller the resolution leaves unscored", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }],
		})
		await resolve(
			question,
			{ correctOptionIds: [options[0].id] },
			{ unscoredUserIds: soleCaller(callers[0].user.id) },
		)
		expect(await eventsFor(callers[0].user.id)).toHaveLength(0)
	})

	it("flags an overturn as rescored, and a no-change re-resolve queues nothing", async () => {
		const { question, options, callers } = await seedOptionQuestion({
			callers: [{ optionIndex: 0 }, { optionIndex: 1 }],
		})
		await resolve(question, { correctOptionIds: [options[0].id] })
		await db.delete(analyticsOutbox)

		await resolve(question, { correctOptionIds: [options[0].id] })
		expect(await db.select().from(analyticsOutbox)).toHaveLength(0)

		await resolve(question, { correctOptionIds: [options[1].id] })
		const [flipped] = await eventsFor(callers[0].user.id)
		expect(flipped.properties).toMatchObject({
			correct: false,
			rescored: true,
			pointsDelta: FULL_MISS,
		})
	})
})

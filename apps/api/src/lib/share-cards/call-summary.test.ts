import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	calls,
	callSelections,
	questionOptions,
	questions,
} from "../../db/schema"
import {
	futureDate,
	makeCall,
	makeOption,
	makeQuestion,
	makeSelection,
	makeUser,
	pastDate,
	seedOptionQuestion,
} from "../../test/factories"
import {
	buildPickLabel,
	loadCallSummaries,
	loadResolvedCallSummaries,
	quipToneFor,
} from "./call-summary"

// The split between these two loaders is load-bearing. The og:image renders
// for a call made a year before it settles, so it needs the unresolved ones;
// the resolution email announces outcomes, so it must never see a call that
// has none. Getting that backwards means either a 404 where a card should be
// or an email claiming a result nobody has decided.

describe("loadCallSummaries", () => {
	it("returns a call on a question still taking calls, with no outcome", async () => {
		const { callers, question } = await seedOptionQuestion({
			question: { status: "open", locksAt: futureDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const callId = callers[0].call.id

		const summary = (await loadCallSummaries([callId])).get(callId)

		expect(summary).toBeDefined()
		expect(summary?.questionStatus).toBe("open")
		expect(summary?.points).toBeNull()
		expect(summary?.isWin).toBeNull()
		expect(summary?.pickLabel).toBe("Yes")
		expect(summary?.createdAt).toBeInstanceOf(Date)
		expect(summary?.locksAt.getTime()).toBe(question.locksAt.getTime())
		expect(summary?.resolvedAt).toBeNull()
	})

	it("carries the resolved date through once the question settles", async () => {
		const { callers, question, options } = await seedOptionQuestion({
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const resolvedAt = pastDate(1)
		await db
			.update(questions)
			.set({ status: "resolved", resolvedAt })
			.where(eq(questions.id, question.id))
		await db
			.update(questionOptions)
			.set({ isCorrect: true })
			.where(eq(questionOptions.id, options[0].id))
		await db
			.update(callSelections)
			.set({ resultPoints: 210 })
			.where(eq(callSelections.callId, callers[0].call.id))

		const callId = callers[0].call.id
		const summary = (await loadCallSummaries([callId])).get(callId)

		expect(summary?.points).toBe(210)
		expect(summary?.isWin).toBe(true)
		expect(summary?.resolvedAt?.getTime()).toBe(resolvedAt.getTime())
	})
})

describe("loadResolvedCallSummaries", () => {
	it("drops a call whose question has not resolved", async () => {
		const { callers } = await seedOptionQuestion({
			question: { status: "open", locksAt: futureDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const callId = callers[0].call.id

		expect((await loadCallSummaries([callId])).has(callId)).toBe(true)
		expect((await loadResolvedCallSummaries([callId])).has(callId)).toBe(false)
	})

	// A question can be flipped to resolved while a specific call still has no
	// final points. The card can render that; an email announcing a result
	// cannot.
	it("drops a resolved call whose points are not final", async () => {
		const { callers, question } = await seedOptionQuestion({
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		await db
			.update(questions)
			.set({ status: "resolved", resolvedAt: pastDate(1) })
			.where(eq(questions.id, question.id))

		const callId = callers[0].call.id
		const summary = (await loadCallSummaries([callId])).get(callId)
		expect(summary?.questionStatus).toBe("resolved")
		expect(summary?.points).toBeNull()
		expect((await loadResolvedCallSummaries([callId])).has(callId)).toBe(false)
	})
})

describe("buildPickLabel on an award shape", () => {
	// isCorrect is null on every option until resolution, so counting hits
	// there returns 0 and prints "0 of 3 hit" - a call nobody has graded
	// reading as a total whiff. Unreachable while the loader dropped
	// unresolved calls; reachable the moment it stopped.
	it("lists the picks instead of scoring them before resolution", async () => {
		const question = await makeQuestion({
			shape: "player_season_award",
			status: "open",
			locksAt: futureDate(48),
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id)
		const labels = ["Nikola Jokic", "Shai Gilgeous-Alexander", "Luka Doncic"]
		for (const [index, label] of labels.entries()) {
			const option = await makeOption(question.id, { label, sortOrder: index })
			await makeSelection(call.id, option.id)
		}

		const summary = (await loadCallSummaries([call.id])).get(call.id)

		expect(summary?.pickLabel).not.toContain("hit")
		for (const label of labels) {
			expect(summary?.pickLabel).toContain(label)
		}
	})

	it("scores the picks once they are graded", () => {
		expect(
			buildPickLabel({
				guessValue: null,
				question: {
					shape: "player_season_award",
					ouLine: null,
					numericToleranceAbsolute: null,
					stat: null,
				},
				selections: [
					{ option: { label: "Jokic", isCorrect: true } },
					{ option: { label: "Luka", isCorrect: false } },
				],
			}),
		).toBe("1 of 2 hit")
	})
})

describe("buildPickLabel on a numeric guess", () => {
	// A win total snapshots an absolute-mode tolerance band the same way a
	// batting average does (5 wins for the NBA, 1 for the NFL), so treating
	// absolute mode alone as "rate stat" printed a 13-win call as "13.000".
	it("keeps a whole-number stat whole", () => {
		expect(
			buildPickLabel({
				guessValue: 13,
				question: {
					shape: "team_season_stat_numeric_guess",
					ouLine: null,
					numericToleranceAbsolute: 5,
					stat: {
						toleranceTier: { toleranceMode: "absolute", toleranceValue: 5 },
					},
				},
				selections: [],
			}),
		).toBe("13")
	})

	it("pads a rate stat to three decimals", () => {
		expect(
			buildPickLabel({
				guessValue: 0.3,
				question: {
					shape: "player_stat_numeric_guess",
					ouLine: null,
					numericToleranceAbsolute: 0.02,
					stat: {
						toleranceTier: { toleranceMode: "absolute", toleranceValue: 0.02 },
					},
				},
				selections: [],
			}),
		).toBe("0.300")
	})

	// An over/under question carries no tolerance snapshot of its own, so the
	// picked stat's tier is the only signal for the line's formatting.
	it("falls back to the stat's own tier for an over/under line", () => {
		expect(
			buildPickLabel({
				guessValue: null,
				question: {
					shape: "team_season_stat_over_under",
					ouLine: 41.5,
					numericToleranceAbsolute: null,
					stat: {
						toleranceTier: { toleranceMode: "absolute", toleranceValue: 5 },
					},
				},
				selections: [{ option: { label: "Over", isCorrect: null } }],
			}),
		).toBe("Over 41.5")
	})
})

// Resolves a seeded question and scores its one caller, so a margin has
// something to read. The margin is derived from stored numbers, not from
// anything the resolver hands back, which is exactly why these go through the
// loader rather than calling buildMargin directly: a column missing from
// loadCallSummaries' own select is invisible to a unit test.
async function settle(opts: {
	questionId: string
	winningOptionId?: string
	optionValues?: { optionId: string; value: number }[]
	numericActualValue?: number
	callId: string
	points: number
	numericGuess?: boolean
}) {
	await db
		.update(questions)
		.set({
			status: "resolved",
			resolvedAt: pastDate(1),
			...(opts.numericActualValue !== undefined
				? { numericActualValue: opts.numericActualValue }
				: {}),
		})
		.where(eq(questions.id, opts.questionId))
	for (const { optionId, value } of opts.optionValues ?? []) {
		await db
			.update(questionOptions)
			.set({
				actualValue: value,
				isCorrect: optionId === opts.winningOptionId,
			})
			.where(eq(questionOptions.id, optionId))
	}
	if (opts.numericGuess) {
		await db
			.update(calls)
			.set({ resultPoints: opts.points })
			.where(eq(calls.id, opts.callId))
	} else {
		await db
			.update(callSelections)
			.set({ resultPoints: opts.points })
			.where(eq(callSelections.callId, opts.callId))
	}
	return (await loadCallSummaries([opts.callId])).get(opts.callId)
}

describe("margin on a loaded call summary", () => {
	it("calls a one score game narrow and a rout a runaway", async () => {
		const narrow = await seedOptionQuestion({
			shape: "team_vs_team",
			optionLabels: ["Panthers", "Falcons"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const narrowSummary = await settle({
			questionId: narrow.question.id,
			winningOptionId: narrow.options[0].id,
			optionValues: [
				{ optionId: narrow.options[0].id, value: 24 },
				{ optionId: narrow.options[1].id, value: 21 },
			],
			callId: narrow.callers[0].call.id,
			points: 150,
		})
		expect(narrowSummary?.margin).toEqual({
			verdict: "narrow",
			label: "By a hair",
		})

		const rout = await seedOptionQuestion({
			shape: "team_vs_team",
			optionLabels: ["Panthers", "Falcons"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const routSummary = await settle({
			questionId: rout.question.id,
			winningOptionId: rout.options[0].id,
			optionValues: [
				{ optionId: rout.options[0].id, value: 34 },
				{ optionId: rout.options[1].id, value: 3 },
			],
			callId: rout.callers[0].call.id,
			points: 150,
		})
		expect(routSummary?.margin).toEqual({
			verdict: "runaway",
			label: "Never in doubt",
		})
	})

	// The game's own margin doesn't depend on which side was backed, so the
	// caller who took the wrong end of a 34-3 gets the same verdict with the
	// other word.
	it("reads the same margin from the losing side", async () => {
		const seeded = await seedOptionQuestion({
			shape: "team_vs_team",
			optionLabels: ["Panthers", "Falcons"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 1 }],
		})
		const summary = await settle({
			questionId: seeded.question.id,
			winningOptionId: seeded.options[0].id,
			optionValues: [
				{ optionId: seeded.options[0].id, value: 34 },
				{ optionId: seeded.options[1].id, value: 3 },
			],
			callId: seeded.callers[0].call.id,
			points: -150,
		})
		expect(summary?.margin).toEqual({
			verdict: "runaway",
			label: "Not close",
		})
	})

	// scoredOptionsFor trims a leader pool to whoever led, so on a win the
	// caller's own pick IS the winner and there is no gap. The Actual line
	// already names who led and what they put up.
	it("leaves a stat leader win unflavored but measures a miss", async () => {
		const won = await seedOptionQuestion({
			shape: "player_game_stat_leader",
			optionLabels: ["Chase", "Higgins"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const wonSummary = await settle({
			questionId: won.question.id,
			winningOptionId: won.options[0].id,
			optionValues: [
				{ optionId: won.options[0].id, value: 118 },
				{ optionId: won.options[1].id, value: 96 },
			],
			callId: won.callers[0].call.id,
			points: 250,
		})
		expect(wonSummary?.margin).toBeNull()

		const missed = await seedOptionQuestion({
			shape: "player_game_stat_leader",
			optionLabels: ["Chase", "Higgins"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 1 }],
		})
		const missedSummary = await settle({
			questionId: missed.question.id,
			winningOptionId: missed.options[0].id,
			optionValues: [
				{ optionId: missed.options[0].id, value: 118 },
				{ optionId: missed.options[1].id, value: 110 },
			],
			callId: missed.callers[0].call.id,
			points: -60,
		})
		expect(missedSummary?.margin?.label).toBe("Inches away")
	})

	// A hand-resolved matchup carries no numbers at all. Nothing to subtract
	// is not the same as a margin of zero.
	it("says nothing about a matchup resolved without numbers", async () => {
		const seeded = await seedOptionQuestion({
			shape: "team_vs_team",
			optionLabels: ["Panthers", "Falcons"],
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const summary = await settle({
			questionId: seeded.question.id,
			winningOptionId: seeded.options[0].id,
			optionValues: [{ optionId: seeded.options[0].id, value: 24 }],
			callId: seeded.callers[0].call.id,
			points: 150,
		})
		expect(summary?.margin).toBeNull()
	})

	// The regression behind selecting numericTolerancePct at all: percentage
	// mode is the common case for a numeric guess, and while the column went
	// unselected every percentage-graded guess silently had no band to measure
	// against and no margin could ever be produced.
	it("rebuilds a percentage-mode guess's band from the stored snapshot", async () => {
		const question = await makeQuestion({
			shape: "player_stat_numeric_guess",
			status: "open",
			locksAt: pastDate(48),
			numericTolerancePct: 0.15,
		})
		const user = await makeUser()
		const call = await makeCall(question.id, user.id, {
			guessValue: 70,
			conviction: 80,
		})
		const summary = await settle({
			questionId: question.id,
			numericActualValue: 80,
			callId: call.id,
			points: 200,
			numericGuess: true,
		})
		expect(summary?.margin?.label).toBe("By a hair")
	})

	it("has nothing to say about a shape with no numbers behind it", async () => {
		const seeded = await seedOptionQuestion({
			question: { status: "open", locksAt: pastDate(48) },
			callers: [{ optionIndex: 0 }],
		})
		const summary = await settle({
			questionId: seeded.question.id,
			winningOptionId: seeded.options[0].id,
			callId: seeded.callers[0].call.id,
			points: 150,
		})
		expect(summary?.margin).toBeNull()
	})
})

describe("quipToneFor", () => {
	// Only two of the four margins get a pool of their own. A narrow win and a
	// runaway loss fall back to the plain vocabulary because the card's own
	// label already says "By a hair" / "Not close" a few pixels up.
	it("gives a pool only to a narrow miss and a runaway win", () => {
		expect(quipToneFor(false, { verdict: "narrow" })).toBe("narrow_miss")
		expect(quipToneFor(true, { verdict: "runaway" })).toBe("runaway_win")
		expect(quipToneFor(true, { verdict: "narrow" })).toBe("win")
		expect(quipToneFor(false, { verdict: "runaway" })).toBe("loss")
		expect(quipToneFor(true, null)).toBe("win")
		expect(quipToneFor(false, null)).toBe("loss")
	})
})

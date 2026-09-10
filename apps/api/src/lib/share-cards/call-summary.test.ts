import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { callSelections, questionOptions, questions } from "../../db/schema"
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

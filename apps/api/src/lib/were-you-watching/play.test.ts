import { describe, expect, it } from "vitest"
import type { WatchQuestion } from "../../db/schema"
import { teamNickname } from "./names"
import {
	evaluateWatchAttempt,
	guestWatchAnswer,
	judgeWatchAnswer,
	parseWatchResultCode,
	watchRunCode,
} from "./play"

const question: WatchQuestion = {
	template: "test",
	prompt: "Who?",
	options: ["A", "B", "C", "D"].map((label) => ({ label, playerId: null })),
	answer: 2,
	reveal: "C did.",
}
const questions = [question, question, question]

const SERVED = new Date("2026-10-27T20:00:00Z")
const at = (ms: number) => new Date(SERVED.getTime() + ms)

const open = (answers = 0) =>
	evaluateWatchAttempt(
		{
			answers: Array.from({ length: answers }, () => ({
				choice: 2,
				servedAt: SERVED.toISOString(),
				answeredAt: SERVED.toISOString(),
				ms: 3000,
				correct: true,
			})),
			openServedAt: SERVED,
		},
		questions.length,
		SERVED,
		{ live: true },
	)

describe("judgeWatchAnswer", () => {
	it("takes an answer inside the clock at its own time", () => {
		const answer = judgeWatchAnswer(questions, open(), 0, 2, at(9900))
		expect(answer).toMatchObject({ correct: true, ms: 9900 })
	})

	it("takes an answer that lands in the grace past the clock, at the clock", () => {
		const answer = judgeWatchAnswer(questions, open(), 0, 1, at(11_400))
		expect(answer).toMatchObject({ correct: false, ms: 10_000, choice: 1 })
	})

	it("counts the clock running out as a miss at the full clock", () => {
		const answer = judgeWatchAnswer(questions, open(), 0, null, at(10_000))
		expect(answer).toMatchObject({ correct: false, ms: 10_000, choice: null })
	})

	it("refuses an answer to a question that isn't the open one", () => {
		expect(judgeWatchAnswer(questions, open(1), 0, 2, at(100))).toBe(
			"wrong_index",
		)
		expect(judgeWatchAnswer(questions, open(), 0, 7, at(100))).toBe(
			"bad_choice",
		)
	})
})

describe("evaluateWatchAttempt", () => {
	it("times out a question left open past the clock and grace", () => {
		const row = { answers: [], openServedAt: SERVED }
		expect(
			evaluateWatchAttempt(row, 3, at(11_400), { live: true }).status,
		).toBe("open")
		const late = evaluateWatchAttempt(row, 3, at(11_600), { live: true })
		expect(late.status).toBe("between")
		expect(late.answers).toHaveLength(1)
		expect(late.answers[0]).toMatchObject({ choice: null, ms: 10_000 })
	})

	it("ends a run whose quiz is no longer up", () => {
		const state = evaluateWatchAttempt(
			{ answers: [], openServedAt: null },
			3,
			SERVED,
			{ live: false },
		)
		expect(state.status).toBe("done")
	})
})

describe("guestWatchAnswer", () => {
	it("keeps a reported time inside the clock", () => {
		expect(guestWatchAnswer(question, 2, 0, SERVED).ms).toBe(500)
		expect(guestWatchAnswer(question, 2, 60_000, SERVED).ms).toBe(10_000)
		expect(guestWatchAnswer(question, 9, 2000, SERVED)).toMatchObject({
			choice: null,
			correct: false,
		})
	})
})

describe("watch result codes", () => {
	it("round-trips a result", () => {
		const code = watchRunCode({
			correctCount: 6,
			total: 7,
			totalMs: 28_420,
			clean: false,
		})
		expect(code).toBe("6-7-284-h")
		expect(parseWatchResultCode(code)).toEqual({
			correct: 6,
			total: 7,
			seconds: 28.4,
			clean: false,
		})
		expect(parseWatchResultCode("8-7-10")).toBeNull()
	})
})

describe("teamNickname", () => {
	it("keeps the nicknames that run to two words", () => {
		expect(teamNickname("Boston Celtics")).toBe("Celtics")
		expect(teamNickname("Boston Red Sox")).toBe("Red Sox")
		expect(teamNickname("Portland Trail Blazers")).toBe("Trail Blazers")
		expect(teamNickname("Golden State Warriors")).toBe("Warriors")
	})
})

import { describe, expect, it } from "vitest"
import {
	type CallFacts,
	type PresserFacts,
	pickAppQuestions,
} from "./templates"

let n = 0
function call(overrides: Partial<CallFacts> = {}): CallFacts {
	n++
	return {
		callId: `call-${n}`,
		pickLabel: "Lakers",
		won: true,
		resultPoints: 100,
		conviction: 50,
		fieldSharePct: 50,
		closenessFieldPct: null,
		lostBy: null,
		redoFlipped: false,
		streakLength: null,
		questionCreatedAt: new Date(2026, 0, n),
		...overrides,
	}
}

function facts(calls: CallFacts[], overrides: Partial<PresserFacts> = {}) {
	return {
		matchup: "LAL @ BOS",
		wins: calls.filter((c) => c.won).length,
		losses: calls.filter((c) => !c.won).length,
		points: 120,
		verdict: null,
		calls,
		...overrides,
	} satisfies PresserFacts
}

describe("pickAppQuestions", () => {
	it("always asks about the game, even with nothing remarkable", () => {
		const drafts = pickAppQuestions(facts([call()]))
		expect(drafts).toEqual([
			{
				template: "game_summary",
				callId: null,
				appKey: "game_summary:game",
				body: "You went 1-0 on LAL @ BOS for +120 points. Which call was your best read?",
			},
		])
	})

	it("asks what went wrong when the game summary is net negative", () => {
		const drafts = pickAppQuestions(
			facts([call({ won: false, resultPoints: -90 })], { points: -90 }),
		)
		expect(drafts.at(-1)?.body).toBe(
			"You went 0-1 on LAL @ BOS for -90 points. What would you do differently?",
		)
	})

	it("asks about a high-conviction miss with the margin", () => {
		const miss = call({
			won: false,
			conviction: 92,
			lostBy: 18,
			resultPoints: -90,
		})
		const [first] = pickAppQuestions(facts([miss]))
		expect(first).toMatchObject({
			template: "high_conviction_miss",
			callId: miss.callId,
			body: "You put 92 conviction on Lakers and they lost by 18. What happened?",
		})
	})

	it("asks at most one question per call and caps the total", () => {
		const calls = [
			call({ won: false, conviction: 90, resultPoints: -80 }),
			call({ won: false, conviction: 85, resultPoints: -70 }),
			call({ won: true, fieldSharePct: 8, resultPoints: 300 }),
			call({ won: true, streakLength: 7, resultPoints: 60 }),
		]
		const drafts = pickAppQuestions(facts(calls))
		expect(drafts).toHaveLength(3)
		const callIds = drafts.map((d) => d.callId).filter(Boolean)
		expect(new Set(callIds).size).toBe(callIds.length)
		expect(drafts.at(-1)?.template).toBe("game_summary")
	})

	it("swaps the summary for the verdict on a perfect or oh-fer game", () => {
		const perfect = pickAppQuestions(
			facts([call()], { wins: 5, losses: 0, verdict: "perfect" }),
		)
		expect(perfect.at(-1)?.template).toBe("perfect_game")
		const ohFer = pickAppQuestions(
			facts([call({ won: false })], { wins: 0, losses: 6, verdict: "oh_fer" }),
		)
		expect(ohFer.at(-1)?.body).toBe(
			"You went 0-6 on LAL @ BOS. Where did it go wrong?",
		)
	})

	it("asks about a close numeric guess few others matched", () => {
		const guess = call({
			pickLabel: "27.5",
			fieldSharePct: null,
			closenessFieldPct: 4,
		})
		const [first] = pickAppQuestions(facts([guess]))
		expect(first?.body).toBe(
			"Only 4% of the field guessed as close as your 27.5. How did you land it?",
		)
	})

	it("never writes an em dash or betting language", () => {
		const calls = [
			call({ won: false, conviction: 90, resultPoints: -9 }),
			call({ won: false, conviction: 99, lostBy: 3, resultPoints: -8 }),
			call({ won: false, redoFlipped: true, resultPoints: -7 }),
			call({ won: true, fieldSharePct: 5, resultPoints: 6 }),
			call({ won: false, fieldSharePct: 5, resultPoints: -5 }),
			call({ won: true, streakLength: 9, resultPoints: 3 }),
		]
		const bodies = [
			...pickAppQuestions(facts(calls)),
			...calls.flatMap((c) => pickAppQuestions(facts([c]))),
		].map((d) => d.body)
		for (const body of bodies) {
			expect(body).not.toMatch(/—|cash|backing|paying|costing|\bbet\b/i)
		}
	})
})

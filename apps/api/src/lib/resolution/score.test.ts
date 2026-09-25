import {
	BASE_POINTS_BY_SHAPE,
	earlyTierFor,
	LOSS_RATE_BY_SHAPE,
	pointsAtStake,
	selectionPoints,
} from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import type { LeagueStatDelta } from "../user-season-stats"
import {
	type GuessCall,
	notifiedCallers,
	type SelectionToScore,
	scoreGuesses,
	scoreSelections,
	unscoredReasonFor,
} from "./score"

const BASE = BASE_POINTS_BY_SHAPE.yes_no_prop
const LOSS_RATE = LOSS_RATE_BY_SHAPE.yes_no_prop
// What a miss at `conviction` costs on this shape.
const miss = (conviction: number) => -pointsAtStake(BASE, LOSS_RATE, conviction)
const at = (day: number) => new Date(Date.UTC(2026, 0, day))
const soleCaller = (userId: string) =>
	new Map([[userId, "creator_sole_caller" as const]])

// A selection on a call of its own by `userId`, one call per user as the
// calls table enforces.
function pick(
	userId: string,
	optionId: string,
	overrides: Partial<Omit<SelectionToScore, "call">> & {
		createdAt?: Date
		unscoredReason?: SelectionToScore["call"]["unscoredReason"]
	} = {},
): SelectionToScore {
	const { createdAt, unscoredReason, ...rest } = overrides
	return {
		id: `${userId}-${optionId}`,
		optionId,
		conviction: 100,
		resultPoints: null,
		...rest,
		call: {
			id: `call-${userId}`,
			userId,
			createdAt: createdAt ?? at(1),
			unscoredReason: unscoredReason ?? null,
		},
	}
}

// A yes/no question's two options, both unresolved unless `wasCorrect`
// names the one a previous resolution marked right.
const yesNo = (wasCorrect?: "yes" | "no") => [
	{ id: "yes", isCorrect: wasCorrect ? wasCorrect === "yes" : null },
	{ id: "no", isCorrect: wasCorrect ? wasCorrect === "no" : null },
]

// Scores a yes/no question whose field is exactly `selections`.
function scoreYesNo(
	selections: SelectionToScore[],
	correct: "yes" | "no",
	extra: {
		wasCorrect?: "yes" | "no"
		unscoredUserIds?: ReturnType<typeof soleCaller>
	} = {},
) {
	const countByOption = new Map<string, number>()
	for (const s of selections) {
		countByOption.set(s.optionId, (countByOption.get(s.optionId) ?? 0) + 1)
	}
	return scoreSelections({
		shape: "yes_no_prop",
		lossRate: LOSS_RATE,
		options: yesNo(extra.wasCorrect),
		correctOptionIds: [correct],
		totalCalls: selections.length,
		countByOption,
		selections,
		earliness: { by: "rank", totalCalls: selections.length },
		unscoredUserIds: extra.unscoredUserIds,
	})
}

const pointsOf = (result: ReturnType<typeof scoreYesNo>, selectionId: string) =>
	result.selectionPoints.find((p) => p.selectionId === selectionId)
		?.resultPoints

// A two-caller split's winner, called first: 50% of the field, rank 1 of 2.
const firstOfTwoWin = (conviction: number) =>
	selectionPoints(
		BASE,
		LOSS_RATE,
		50,
		2,
		conviction,
		true,
		earlyTierFor(1, 2).mult,
	)

describe("scoreSelections", () => {
	it("matches the shared scoring formula exactly", () => {
		const result = scoreYesNo(
			[
				pick("a", "yes", { createdAt: at(1) }),
				pick("b", "no", { createdAt: at(2) }),
			],
			"yes",
		)
		expect(pointsOf(result, "a-yes")).toBe(firstOfTwoWin(100))
		expect(pointsOf(result, "b-no")).toBe(miss(100))
	})

	it("scales a win by conviction", () => {
		const points = (conviction: number) =>
			pointsOf(
				scoreYesNo(
					[
						pick("a", "yes", { conviction, createdAt: at(1) }),
						pick("b", "no", { createdAt: at(2) }),
					],
					"yes",
				),
				"a-yes",
			)
		expect(points(100)).toBe(firstOfTwoWin(100))
		expect(points(50)).toBe(firstOfTwoWin(50))
		expect(firstOfTwoWin(50)).toBeLessThan(firstOfTwoWin(100))
	})

	it("scales a loss by conviction alone", () => {
		const result = scoreYesNo(
			[pick("a", "yes"), pick("b", "no", { conviction: 40 })],
			"yes",
		)
		expect(pointsOf(result, "b-no")).toBe(miss(40))
	})

	it("charges a miss at its side's own rate when the line was priced", () => {
		const selections = [
			pick("a", "over", { conviction: 50 }),
			pick("b", "under", { conviction: 50 }),
		]
		const result = scoreSelections({
			shape: "player_stat_over_under",
			lossRate: 1,
			options: [
				{ id: "over", isCorrect: null, lossRate: 0.5 },
				{ id: "under", isCorrect: null, lossRate: null },
			],
			correctOptionIds: ["under"],
			totalCalls: 2,
			countByOption: new Map([
				["over", 1],
				["under", 1],
			]),
			selections,
			earliness: { by: "rank", totalCalls: 2 },
		})
		expect(pointsOf(result, "a-over")).toBe(-Math.round(BASE * 0.5 * 0.5))

		const flipped = scoreSelections({
			shape: "player_stat_over_under",
			lossRate: 1,
			options: [
				{ id: "over", isCorrect: null, lossRate: 0.5 },
				{ id: "under", isCorrect: null, lossRate: null },
			],
			correctOptionIds: ["over"],
			totalCalls: 2,
			countByOption: new Map([
				["over", 1],
				["under", 1],
			]),
			selections,
			earliness: { by: "rank", totalCalls: 2 },
		})
		// No side rate of its own, so the question's full rate.
		expect(pointsOf(flipped, "b-under")).toBe(-Math.round(BASE * 0.5))
	})

	it("banks conviction behind a hit on both sums and a miss on the total only", () => {
		const { tally } = scoreYesNo(
			[
				pick("a", "yes", { conviction: 80 }),
				pick("b", "no", { conviction: 35 }),
			],
			"yes",
		)
		expect(tally.statDeltas.get("a")).toMatchObject({
			resolvedCallCount: 1,
			correctCount: 1,
			convictionSum: 80,
			convictionSumCorrect: 80,
			callCount: 0,
		})
		expect(tally.statDeltas.get("b")).toMatchObject({
			resolvedCallCount: 1,
			correctCount: 0,
			convictionSum: 35,
			convictionSumCorrect: 0,
		})
	})

	it("gives an award's picks one earliness and counts each pick", () => {
		const selections = ["x", "y"].map((optionId) => ({
			...pick("a", optionId),
			id: optionId,
		}))
		const result = scoreSelections({
			shape: "player_season_award",
			lossRate: LOSS_RATE_BY_SHAPE.player_season_award,
			options: [
				{ id: "x", isCorrect: null },
				{ id: "y", isCorrect: null },
			],
			correctOptionIds: ["x"],
			totalCalls: 1,
			countByOption: new Map([
				["x", 1],
				["y", 1],
			]),
			selections,
			earliness: { by: "season", games: [] },
		})
		expect(pointsOf(result, "x")).toBeGreaterThan(0)
		expect(result.tally.statDeltas.get("a")).toMatchObject({
			resolvedCallCount: 2,
			correctCount: 1,
		})
		expect(result.tally.newPointsByUserId.get("a")).toBe(
			(pointsOf(result, "x") ?? 0) + (pointsOf(result, "y") ?? 0),
		)
	})

	describe("re-resolution (dispute overturn)", () => {
		it("nets a re-resolve to the same outcome to nothing and flags it rescored", () => {
			const first = scoreYesNo([pick("a", "yes", { conviction: 65 })], "yes")
			const again = scoreYesNo(
				[
					pick("a", "yes", {
						conviction: 65,
						resultPoints: pointsOf(first, "a-yes"),
					}),
				],
				"yes",
				{ wasCorrect: "yes" },
			)
			const d = again.tally.statDeltas.get("a") as LeagueStatDelta
			expect(Object.values(d).every((v) => v === 0)).toBe(true)
			expect(again.tally.rescoredUsers.has("a")).toBe(true)
			expect(notifiedCallers(again.tally.statDeltas, again.tally)).toEqual([])
		})

		it("claws back the prior award and moves the conviction sums when it flips", () => {
			const priorWin = firstOfTwoWin(90)
			const result = scoreYesNo(
				[
					pick("a", "yes", {
						conviction: 90,
						createdAt: at(1),
						resultPoints: priorWin,
					}),
					pick("b", "no", {
						conviction: 20,
						createdAt: at(2),
						resultPoints: miss(20),
					}),
				],
				"no",
				{ wasCorrect: "yes" },
			)
			expect(result.tally.statDeltas.get("a")).toEqual({
				points: miss(90) - priorWin,
				resolvedCallCount: 0,
				correctCount: -1,
				convictionSum: 0,
				convictionSumCorrect: -90,
				callCount: 0,
			})
			expect(result.tally.statDeltas.get("b")).toMatchObject({
				resolvedCallCount: 0,
				correctCount: 1,
				convictionSum: 0,
				convictionSumCorrect: 20,
			})
		})

		it("notifies with what the call is worth now, not the portfolio swing", () => {
			const result = scoreYesNo(
				[
					pick("a", "yes", {
						createdAt: at(1),
						resultPoints: firstOfTwoWin(100),
					}),
					pick("b", "no", { createdAt: at(2), resultPoints: miss(100) }),
				],
				"no",
				{ wasCorrect: "yes" },
			)
			const [loser] = notifiedCallers(result.tally.statDeltas, result.tally)
			expect(loser).toEqual({
				userId: "a",
				callId: "call-a",
				pointsDelta: miss(100),
				rescored: true,
			})
		})
	})

	describe("unscored calls", () => {
		it("leaves an excluded call unscored, out of every stat and unreported", () => {
			const result = scoreYesNo([pick("a", "yes")], "yes", {
				unscoredUserIds: soleCaller("a"),
			})
			expect(pointsOf(result, "a-yes")).toBeNull()
			expect(result.callReasons).toEqual([
				{ callId: "call-a", unscoredReason: "creator_sole_caller" },
			])
			const d = result.tally.statDeltas.get("a") as LeagueStatDelta
			expect(Object.values(d).every((v) => v === 0)).toBe(true)
			expect(notifiedCallers(result.tally.statDeltas, result.tally)).toEqual([])
		})

		it("keeps a persisted exclusion when re-resolved without it", () => {
			const result = scoreYesNo(
				[pick("a", "yes", { unscoredReason: "creator_sole_caller" })],
				"yes",
			)
			expect(pointsOf(result, "a-yes")).toBeNull()
			expect(result.callReasons).toEqual([])
			expect(result.tally.unscoredUsers.has("a")).toBe(true)
		})

		it("still counts an excluded call in the field the others score against", () => {
			const result = scoreYesNo(
				[
					pick("a", "yes", { createdAt: at(1) }),
					pick("b", "no", { createdAt: at(2) }),
				],
				"yes",
				{ unscoredUserIds: soleCaller("b") },
			)
			expect(pointsOf(result, "a-yes")).toBe(firstOfTwoWin(100))
		})

		it("clears a question_voided reason, since resolving lifts it", () => {
			const result = scoreYesNo(
				[pick("a", "yes", { unscoredReason: "question_voided" })],
				"yes",
			)
			expect(pointsOf(result, "a-yes")).toBeGreaterThan(0)
			expect(result.callReasons).toEqual([
				{ callId: "call-a", unscoredReason: null },
			])
		})
	})
})

describe("scoreGuesses", () => {
	const guess = (
		userId: string,
		guessValue: number | null,
		overrides: Partial<GuessCall> = {},
	): GuessCall => ({
		id: `call-${userId}`,
		userId,
		guessValue,
		conviction: 100,
		resultPoints: null,
		hitTolerance: null,
		unscoredReason: null,
		createdAt: at(1),
		...overrides,
	})
	const score = (
		calls: GuessCall[],
		unscoredUserIds?: ReturnType<typeof soleCaller>,
	) =>
		scoreGuesses({
			shape: "player_stat_numeric_guess",
			lossRate: LOSS_RATE_BY_SHAPE.player_stat_numeric_guess,
			tolerance: { mode: "percentage", pct: 0.1 },
			actualValue: 100,
			calls,
			unscoredUserIds,
		})

	it("scores hits and misses and reads conviction off the call", () => {
		const { updates, tally } = score([
			guess("hit", 100, { conviction: 75 }),
			guess("miss", 5000, { conviction: 25 }),
		])
		const [hit, miss] = updates
		expect(hit.set.hitTolerance).toBe(true)
		expect(hit.set.resultPoints).toBeGreaterThan(0)
		expect(miss.set).toMatchObject({
			hitTolerance: false,
			closenessMult: null,
			closenessFieldPct: null,
		})
		expect(tally.statDeltas.get("hit")).toMatchObject({
			correctCount: 1,
			convictionSum: 75,
			convictionSumCorrect: 75,
		})
		expect(tally.statDeltas.get("miss")).toMatchObject({
			correctCount: 0,
			convictionSum: 25,
			convictionSumCorrect: 0,
		})
	})

	it("leaves an excluded guess unscored with every result column cleared", () => {
		const { updates, tally } = score([guess("a", 100)], soleCaller("a"))
		expect(updates).toEqual([
			{
				callId: "call-a",
				set: {
					resultPoints: null,
					hitTolerance: null,
					closenessMult: null,
					closenessFieldPct: null,
					unscoredReason: "creator_sole_caller",
				},
			},
		])
		expect(tally.unscoredUsers.has("a")).toBe(true)
	})

	it("claws back a hit an overturn turns into a miss", () => {
		const { tally } = score([
			guess("a", 5000, {
				conviction: 40,
				resultPoints: 300,
				hitTolerance: true,
			}),
		])
		expect(tally.statDeltas.get("a")).toMatchObject({
			resolvedCallCount: 0,
			correctCount: -1,
			convictionSum: 0,
			convictionSumCorrect: -40,
		})
		expect(tally.rescoredUsers.has("a")).toBe(true)
	})

	it("leaves a call with no guess out of the field and untouched", () => {
		const { updates, tally } = score([guess("a", 100), guess("b", null)])
		expect(updates.map((u) => u.callId)).toEqual(["call-a"])
		expect(tally.statDeltas.has("b")).toBe(false)
	})
})

describe("unscoredReasonFor", () => {
	it("prefers this pass's override over what's persisted", () => {
		expect(unscoredReasonFor(soleCaller("a"), "a", null)).toBe(
			"creator_sole_caller",
		)
	})

	it("keeps a persisted reason and lifts question_voided", () => {
		expect(unscoredReasonFor(undefined, "a", "creator_sole_caller")).toBe(
			"creator_sole_caller",
		)
		expect(unscoredReasonFor(undefined, "a", "question_voided")).toBeNull()
	})
})

import {
	BASE_POINTS_BY_SHAPE,
	basePointsFor,
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
		isOfficial?: boolean
	} = {},
) {
	return scoreSelections({
		shape: "yes_no_prop",
		isOfficial: extra.isOfficial ?? true,
		lossRate: LOSS_RATE,
		options: yesNo(extra.wasCorrect),
		correctOptionIds: [correct],
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

const challengePointsOf = (
	result: ReturnType<typeof scoreYesNo>,
	selectionId: string,
) =>
	result.selectionPoints.find((p) => p.selectionId === selectionId)
		?.challengePoints

describe("scoreSelections", () => {
	it("scores challenge points without earliness or the season-play weight", () => {
		const selections = [
			pick("a", "yes", { createdAt: at(1) }),
			pick("b", "no", { createdAt: at(2) }),
		]
		const result = scoreSelections({
			shape: "yes_no_prop",
			isOfficial: true,
			lossRate: LOSS_RATE,
			options: yesNo(),
			correctOptionIds: ["yes"],
			selections,
			earliness: { by: "rank", totalCalls: 2 },
			weightByCallId: new Map([
				["call-a", 0.5],
				["call-b", 0.5],
			]),
		})
		expect(challengePointsOf(result, "a-yes")).toBe(
			selectionPoints(BASE, LOSS_RATE, 50, 2, 100, true, 1),
		)
		expect(challengePointsOf(result, "b-no")).toBe(miss(100))
		expect(pointsOf(result, "b-no")).toBe(
			-pointsAtStake(BASE * 0.5, LOSS_RATE, 100),
		)
	})

	it("leaves an unscored call without challenge points", () => {
		const result = scoreYesNo([pick("a", "yes")], "yes", {
			unscoredUserIds: soleCaller("a"),
		})
		expect(challengePointsOf(result, "a-yes")).toBeNull()
	})

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

	it("reads boldness off the field's conviction, not its head count", () => {
		// Two throwaway calls on "no" don't make a full-conviction "yes" rare.
		const result = scoreYesNo(
			[
				pick("a", "yes", { createdAt: at(1) }),
				pick("b", "no", { conviction: 1, createdAt: at(2) }),
				pick("c", "no", { conviction: 1, createdAt: at(3) }),
			],
			"yes",
		)
		expect(pointsOf(result, "a-yes")).toBe(
			selectionPoints(
				BASE,
				LOSS_RATE,
				(100 / 102) * 100,
				2,
				100,
				true,
				earlyTierFor(1, 3).mult,
			),
		)
	})

	it("scales a win by conviction", () => {
		const points = (conviction: number) =>
			pointsOf(
				scoreYesNo(
					[
						pick("a", "yes", { conviction, createdAt: at(1) }),
						pick("b", "no", { conviction, createdAt: at(2) }),
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

	it("scores a community question off its scaled-down base", () => {
		const result = scoreYesNo(
			[
				pick("a", "yes", { createdAt: at(1) }),
				pick("b", "no", { createdAt: at(2) }),
			],
			"yes",
			{ isOfficial: false },
		)
		const base = basePointsFor({
			shape: "yes_no_prop",
			isOfficial: false,
			isPriced: false,
		})
		expect(base).toBeLessThan(BASE)
		expect(pointsOf(result, "a-yes")).toBe(
			selectionPoints(
				base,
				LOSS_RATE,
				50,
				2,
				100,
				true,
				earlyTierFor(1, 2).mult,
			),
		)
		expect(pointsOf(result, "b-no")).toBe(-pointsAtStake(base, LOSS_RATE, 100))
	})

	it("charges a miss at its side's own rate when the line was priced", () => {
		const selections = [
			pick("a", "over", { conviction: 50 }),
			pick("b", "under", { conviction: 50 }),
		]
		const result = scoreSelections({
			shape: "player_stat_over_under",
			isOfficial: true,
			lossRate: 1,
			options: [
				{ id: "over", isCorrect: null, lossRate: 0.5 },
				{ id: "under", isCorrect: null, lossRate: null },
			],
			correctOptionIds: ["under"],
			selections,
			earliness: { by: "rank", totalCalls: 2 },
		})
		expect(pointsOf(result, "a-over")).toBe(-Math.round(BASE * 0.5 * 0.5))

		const flipped = scoreSelections({
			shape: "player_stat_over_under",
			isOfficial: true,
			lossRate: 1,
			options: [
				{ id: "over", isCorrect: null, lossRate: 0.5 },
				{ id: "under", isCorrect: null, lossRate: null },
			],
			correctOptionIds: ["over"],
			selections,
			earliness: { by: "rank", totalCalls: 2 },
		})
		// No side rate of its own, so the question's full rate.
		expect(pointsOf(flipped, "b-under")).toBe(-Math.round(BASE * 0.5))
	})

	it("scores a priced community question at the full base", () => {
		const result = scoreSelections({
			shape: "player_vs_player",
			isOfficial: false,
			lossRate: 1,
			options: [
				{
					id: "a",
					isCorrect: null,
					winMult: 1,
					lossRate: 0.96,
					modelHitRate: 0.5,
				},
				{
					id: "b",
					isCorrect: null,
					winMult: 1,
					lossRate: 0.96,
					modelHitRate: 0.5,
				},
			],
			correctOptionIds: ["a"],
			selections: [pick("x", "a"), pick("y", "b")],
			earliness: { by: "rank", totalCalls: 2 },
		})
		expect(pointsOf(result, "y-b")).toBe(
			-pointsAtStake(BASE_POINTS_BY_SHAPE.player_vs_player, 0.96, 100),
		)
	})

	it("pays a priced underdog's win multiplier and no boldness", () => {
		// A quarter of the field took the underdog, which would pay a boldness
		// bonus on an unpriced question. Its bigger win already pays for how
		// unlikely it was.
		const selections = [
			pick("a", "underdog", { createdAt: at(1) }),
			pick("b", "favorite", { createdAt: at(2) }),
			pick("c", "favorite", { createdAt: at(3) }),
			pick("d", "favorite", { createdAt: at(4) }),
		]
		const result = scoreSelections({
			shape: "player_vs_player",
			isOfficial: true,
			lossRate: 1,
			options: [
				{
					id: "underdog",
					isCorrect: null,
					winMult: 1.84,
					lossRate: 0.96,
					modelHitRate: 0.25,
				},
				{
					id: "favorite",
					isCorrect: null,
					winMult: 1,
					lossRate: 1.8,
					modelHitRate: 0.75,
				},
			],
			correctOptionIds: ["underdog"],
			selections,
			earliness: { by: "rank", totalCalls: 4 },
		})
		const base = BASE_POINTS_BY_SHAPE.player_vs_player
		const early = earlyTierFor(1, 4).mult
		const pricing = { winMult: 1.84, modelHitRate: 0.25 }
		const priced = selectionPoints(base, 0.96, 25, 2, 100, true, early, pricing)
		expect(pointsOf(result, "a-underdog")).toBe(priced)
		expect(priced).toBe(Math.round(base * 1.84 * early))
		expect(pointsOf(result, "b-favorite")).toBe(-pointsAtStake(base, 1.8, 100))
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
			isOfficial: true,
			lossRate: LOSS_RATE_BY_SHAPE.player_season_award,
			options: [
				{ id: "x", isCorrect: null },
				{ id: "y", isCorrect: null },
			],
			correctOptionIds: ["x"],
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
			isOfficial: true,
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
					challengePoints: null,
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

import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	type CallSummaryData,
	callMarginFor,
	lossContext,
	marginLabel,
	resultContext,
} from "#/lib/call-summary"

// The Standard tier from apps/api's db/catalog/stats.ts, in the GraphQL
// casing the web sees it in ("PERCENTAGE", not "percentage").
const STANDARD_TIER = { toleranceMode: "PERCENTAGE", toleranceValue: 0.15 }
const HIGH_VOLUME_TIER = { toleranceMode: "PERCENTAGE", toleranceValue: 0.1 }

function call(over: {
	shape: QuestionShape
	totalPoints: number | null
	guessValue?: number | null
	ouLine?: number | null
	numericActualValue?: number | null
	numericToleranceAbsolute?: number | null
	numericTolerancePct?: number | null
	tier?: { toleranceMode: string; toleranceValue: number } | null
	scoredOptions?: { label: string; actualValue: number | null }[]
	pickActualValue?: number | null
}): CallSummaryData {
	return {
		guessValue: over.guessValue ?? null,
		conviction: 80,
		totalPoints: over.totalPoints,
		question: {
			shape: over.shape,
			ouLine: over.ouLine ?? null,
			numericActualValue: over.numericActualValue ?? null,
			numericToleranceAbsolute: over.numericToleranceAbsolute ?? null,
			numericTolerancePct: over.numericTolerancePct ?? null,
			stat: over.tier === null ? null : { toleranceTier: over.tier ?? STANDARD_TIER },
			scoredOptions: over.scoredOptions ?? [],
		},
		selections: [
			{
				id: "sel-1",
				conviction: 80,
				option: {
					label: "Over",
					isCorrect: (over.totalPoints ?? 0) >= 0,
					actualValue: over.pickActualValue ?? null,
				},
			},
		],
	}
}

describe("callMarginFor", () => {
	// The case this whole feature exists for: an over/under that missed by a
	// yard used to state its line and its actual and leave the reader to
	// subtract them.
	it("measures an over/under against its line", () => {
		const margin = callMarginFor(
			call({
				shape: "PLAYER_STAT_OVER_UNDER",
				totalPoints: -120,
				ouLine: 224.5,
				numericActualValue: 224,
				tier: HIGH_VOLUME_TIER,
			}),
		)
		expect(margin?.displayDistance).toBe(1)
		expect(margin?.verdict).toBe("narrow")
	})

	it("gives a pending call no margin at all", () => {
		expect(
			callMarginFor(
				call({
					shape: "PLAYER_STAT_OVER_UNDER",
					totalPoints: null,
					ouLine: 224.5,
					numericActualValue: 224,
				}),
			),
		).toBeNull()
	})

	it("falls back to the Standard tier when the question has no stat", () => {
		const margin = callMarginFor(
			call({
				shape: "GAME_TOTAL_OVER_UNDER",
				totalPoints: 150,
				ouLine: 224.5,
				numericActualValue: 300,
				tier: null,
			}),
		)
		expect(margin?.verdict).toBe("runaway")
	})

	it("rebuilds a numeric guess's band from the percentage snapshot", () => {
		// The regression behind selecting numericTolerancePct at all: percentage
		// mode is the common case, and without it every percentage-graded guess
		// silently had no band to measure against.
		const margin = callMarginFor(
			call({
				shape: "PLAYER_STAT_NUMERIC_GUESS",
				totalPoints: 200,
				guessValue: 70,
				numericActualValue: 80,
				numericTolerancePct: 0.15,
			}),
		)
		expect(margin?.verdict).toBe("narrow")
	})

	it("reads a head-to-head off both sides of the scoreline", () => {
		const margin = callMarginFor(
			call({
				shape: "TEAM_VS_TEAM",
				totalPoints: 150,
				scoredOptions: [
					{ label: "Panthers", actualValue: 34 },
					{ label: "Falcons", actualValue: 3 },
				],
			}),
		)
		expect(margin?.displayDistance).toBe(31)
		expect(margin?.verdict).toBe("runaway")
	})

	// scoredOptions is trimmed to the leader, so on a win the caller's own pick
	// and the winner are the same row and there is no gap to describe. The
	// Actual line already names who led and what they put up.
	it("leaves a stat leader win unflavored and measures a miss", () => {
		const won = callMarginFor(
			call({
				shape: "PLAYER_GAME_STAT_LEADER",
				totalPoints: 250,
				scoredOptions: [{ label: "Chase", actualValue: 118 }],
				pickActualValue: 118,
			}),
		)
		expect(won).toBeNull()

		const missed = callMarginFor(
			call({
				shape: "PLAYER_GAME_STAT_LEADER",
				totalPoints: -60,
				scoredOptions: [{ label: "Chase", actualValue: 118 }],
				pickActualValue: 110,
			}),
		)
		expect(missed?.displayDistance).toBe(8)
		expect(missed?.verdict).toBe("narrow")
	})

	it("gives the shapes with no numbers behind them no margin", () => {
		const shapes: QuestionShape[] = [
			"YES_NO_PROP",
			"PLAYER_SEASON_AWARD",
			"TEAM_SEASON_AWARD",
			"PLAYER_AWARD_FINALISTS",
		]
		for (const shape of shapes) {
			expect(callMarginFor(call({ shape, totalPoints: 150 })), shape).toBeNull()
		}
	})

	// A fragment that only wants a pick label doesn't select the margin fields,
	// and that has to cost it the margin rather than throwing.
	it("returns null rather than throwing when the fields weren't selected", () => {
		const bare = call({ shape: "TEAM_VS_TEAM", totalPoints: 150 })
		bare.question.scoredOptions = undefined
		bare.question.numericTolerancePct = undefined
		expect(callMarginFor(bare)).toBeNull()
	})
})

describe("marginLabel", () => {
	it("names each of the four outcomes distinctly", () => {
		const labels = [
			marginLabel("narrow", false),
			marginLabel("narrow", true),
			marginLabel("runaway", true),
			marginLabel("runaway", false),
		]
		expect(labels).toEqual([
			"Inches away",
			"By a hair",
			"Never in doubt",
			"Not close",
		])
		expect(new Set(labels).size).toBe(4)
	})
})

describe("resultContext", () => {
	// A pure regression on generalizing lossContext: the numeric-guess loss
	// sub-line has to keep saying what it always said.
	it("keeps the numeric guess loss's actual value", () => {
		const losing = call({
			shape: "PLAYER_STAT_NUMERIC_GUESS",
			totalPoints: -75,
			guessValue: 40,
			numericActualValue: 80,
			numericTolerancePct: 0.15,
		})
		expect(lossContext(losing)).toBe("actual was 80")
		expect(resultContext(losing)[0]).toBe("actual was 80")
	})

	it("states the distance and the flavor as separate clauses", () => {
		expect(
			resultContext(
				call({
					shape: "PLAYER_STAT_OVER_UNDER",
					totalPoints: -120,
					ouLine: 224.5,
					numericActualValue: 224,
					tier: HIGH_VOLUME_TIER,
				}),
			),
		).toEqual(["off by 1", "inches away"])
	})

	it("drops the flavor clause when the margin wasn't remarkable", () => {
		expect(
			resultContext(
				call({
					shape: "PLAYER_STAT_OVER_UNDER",
					totalPoints: 150,
					ouLine: 224.5,
					numericActualValue: 245,
					tier: HIGH_VOLUME_TIER,
				}),
			),
		).toEqual(["off by 21"])
	})

	it("says nothing at all about a pending call", () => {
		expect(
			resultContext(
				call({
					shape: "PLAYER_STAT_OVER_UNDER",
					totalPoints: null,
					ouLine: 224.5,
				}),
			),
		).toEqual([])
	})
})

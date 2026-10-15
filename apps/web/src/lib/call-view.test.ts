import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import { type CallRecord, describeCall, firstDefined } from "./call-view"

type Selection = {
	conviction: number
	label: string
	isCorrect?: boolean | null
	fieldPct?: number | null
}

function selection(s: Selection, i: number) {
	return {
		id: `sel-${i}`,
		conviction: s.conviction,
		resultPoints: null,
		option: {
			id: `opt-${i}`,
			label: s.label,
			isCorrect: s.isCorrect ?? null,
			fieldPct: s.fieldPct ?? null,
			actualValue: null,
			team: null,
			player: null,
		},
	}
}

function call(over: {
	shape: QuestionShape
	totalPoints?: number | null
	guessValue?: number | null
	conviction?: number | null
	numericActualValue?: number | null
	selections?: Selection[]
	redo?: CallRecord["redo"]
}): CallRecord {
	return {
		id: "call-1",
		createdAt: "2026-03-03T18:00:00Z",
		conviction: over.conviction ?? null,
		caseText: null,
		guessValue: over.guessValue ?? null,
		totalPoints: over.totalPoints ?? null,
		redo: over.redo ?? null,
		user: {
			id: "u1",
			name: "Quinn",
			username: "quinn",
			avatarUrl: null,
		},
		question: {
			id: "q1",
			title: "Who will win?",
			shape: over.shape,
			status: "RESOLVED",
			locksAt: "2026-03-08T18:00:00Z",
			resolvedAt: "2026-03-09T18:00:00Z",
			ouLine: null,
			numericActualValue: over.numericActualValue ?? null,
			numericToleranceAbsolute: null,
			numericTolerancePct: null,
			scoredOptions: [],
			stat: null,
			league: { id: "l1", abbreviation: "nfl", slug: "nfl" },
		},
		selections: (over.selections ?? []).map(selection),
	} as unknown as CallRecord
}

describe("describeCall", () => {
	it("states a lone selection's field share and its conviction", () => {
		const view = describeCall(
			call({
				shape: "TEAM_VS_TEAM",
				totalPoints: 120,
				selections: [{ conviction: 70, label: "Chicago Bears", fieldPct: 42 }],
			}),
		)
		expect(view.isWin).toBe(true)
		expect(view.fieldPct).toBe(42)
		expect(view.conviction).toBe(70)
		expect(view.closeness).toBeNull()
		expect(view.leagueAbbr).toBe("NFL")
	})

	it("leaves the field share off a multi-pick call and averages its conviction", () => {
		const view = describeCall(
			call({
				shape: "PLAYER_SEASON_AWARD",
				totalPoints: -40,
				selections: [
					{ conviction: 60, label: "A", fieldPct: 30 },
					{ conviction: 81, label: "B", fieldPct: 20 },
				],
			}),
		)
		expect(view.isWin).toBe(false)
		expect(view.fieldPct).toBeNull()
		expect(view.conviction).toBe(71)
	})

	it("calls an exact numeric guess exact and a near one off by the gap", () => {
		const exact = describeCall(
			call({
				shape: "PLAYER_STAT_NUMERIC_GUESS",
				guessValue: 63,
				conviction: 55,
				numericActualValue: 63,
			}),
		)
		expect(exact.closeness).toEqual({ kind: "exact" })
		expect(exact.conviction).toBe(55)
		expect(exact.fieldPct).toBeNull()

		const off = describeCall(
			call({
				shape: "PLAYER_STAT_NUMERIC_GUESS",
				guessValue: 60,
				numericActualValue: 63,
			}),
		)
		expect(off.closeness).toEqual({ kind: "off", by: "3" })
	})

	it("has no result before the question resolves", () => {
		const view = describeCall(
			call({
				shape: "TEAM_VS_TEAM",
				selections: [{ conviction: 50, label: "Chicago Bears" }],
			}),
		)
		expect(view.isWin).toBeNull()
		expect(view.points).toBeNull()
		expect(view.redo).toBeNull()
	})

	it("judges a redo's abandoned pick against the same outcome", () => {
		const view = describeCall(
			call({
				shape: "TEAM_VS_TEAM",
				totalPoints: -50,
				selections: [
					{ conviction: 60, label: "Green Bay Packers", isCorrect: false },
				],
				redo: {
					id: "r1",
					redoneAt: "2026-03-05T18:00:00Z",
					originalCreatedAt: "2026-03-03T18:00:00Z",
					originalGuessValue: null,
					originalConviction: null,
					originalCaseText: "Bears at home",
					originalSelections: [
						{
							id: "os1",
							conviction: 60,
							option: {
								id: "o1",
								label: "Chicago Bears",
								isCorrect: true,
								actualValue: null,
							},
						},
					],
				},
			}),
		)
		expect(view.redo).toMatchObject({
			originalCalledAt: "2026-03-03T18:00:00Z",
			redoneAt: "2026-03-05T18:00:00Z",
			originalCaseText: "Bears at home",
			originalWasCorrect: true,
			currentIsWin: false,
		})
		expect(view.redo?.originalPickLabel).not.toBe(view.redo?.currentPickLabel)
	})
})

describe("firstDefined", () => {
	it("is null with nothing resolved", () => {
		expect(firstDefined([])).toBeNull()
		expect(firstDefined([null, undefined])).toBeNull()
	})

	it("is right when any pick was", () => {
		expect(firstDefined([false, true])).toBe(true)
		expect(firstDefined([false, null])).toBe(false)
	})
})

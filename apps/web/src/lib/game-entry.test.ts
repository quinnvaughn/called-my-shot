import { describe, expect, it } from "vitest"
import { gameEntryRows, viewerGamePicksSummary } from "./game-entry"

const past = "2020-01-01T00:00:00.000Z"
const future = "2999-01-01T00:00:00.000Z"

const call = (isCorrect: boolean | null, totalPoints: number | null) => ({
	hitTolerance: null,
	totalPoints,
	selections: [{ option: { isCorrect } }],
})

describe("viewerGamePicksSummary", () => {
	it("counts calls, settled results and final points", () => {
		expect(
			viewerGamePicksSummary([
				{ status: "RESOLVED", locksAt: past, viewerCall: call(true, 40) },
				{ status: "RESOLVED", locksAt: past, viewerCall: call(false, -15) },
				{ status: "OPEN", locksAt: future, viewerCall: call(null, null) },
				{ status: "OPEN", locksAt: future, viewerCall: null },
			]),
		).toEqual({
			calledCount: 3,
			questionCount: 4,
			wins: 1,
			losses: 1,
			points: 25,
		})
	})
})

describe("gameEntryRows", () => {
	const now = Date.parse("2026-10-14T12:00:00.000Z")
	const q = (
		id: string,
		shape: "TEAM_VS_TEAM" | "GAME_TOTAL_OVER_UNDER" | "PLAYER_STAT_OVER_UNDER",
		locksAt: string,
		subjectPlayer: { name: string } | null = null,
	) => ({
		id,
		shape,
		createdAt: "2026-10-01T00:00:00.000Z",
		status: "OPEN" as const,
		locksAt,
		stat: null,
		subjectTeam: null,
		subjectPlayer,
		options: [],
	})

	it("orders called rows like the game page and splits the rest by whether they're still open", () => {
		const members = [
			{ question: q("total", "GAME_TOTAL_OVER_UNDER", past), call: null },
			{
				question: q("allen", "PLAYER_STAT_OVER_UNDER", future, {
					name: "Josh Allen",
				}),
				call: "over",
			},
			{ question: q("winner", "TEAM_VS_TEAM", future), call: "home" },
			{ question: q("mystery", "PLAYER_STAT_OVER_UNDER", future), call: null },
		]
		const result = gameEntryRows(members, now)
		expect(
			result.called.map((r) => [r.section, r.question.id, r.call, r.code]),
		).toEqual([
			["Game winner", "winner", "home", "Winner"],
			["Player lines", "allen", "over", "Allen"],
		])
		// A question with nothing to build a chip from shows its position.
		expect(result.notCalledYet).toEqual(["4"])
		expect(result.missed).toEqual(["Total"])
		expect(result.isOpen).toBe(true)
		expect(result.hasOpenCalls).toBe(true)
	})

	it("reports nothing open once every question has locked", () => {
		const result = gameEntryRows(
			[
				{ question: q("winner", "TEAM_VS_TEAM", past), call: "home" },
				{ question: q("total", "GAME_TOTAL_OVER_UNDER", past), call: null },
			],
			now,
		)
		expect(result.isOpen).toBe(false)
		expect(result.hasOpenCalls).toBe(false)
		expect(result.notCalledYet).toEqual([])
		expect(result.missed).toEqual(["Total"])
	})
})

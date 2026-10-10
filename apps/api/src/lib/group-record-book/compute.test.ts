import { describe, expect, it } from "vitest"
import type { RecapCall } from "../group-recap/types"
import { weekContaining } from "../group-recap/week"
import { compileRecordBook, type RecordBookRecap } from "./compute"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const FIRST = new Date("2026-09-16T12:00:00Z")

// The nth week after FIRST's, with these winners and best calls.
function recap(
	n: number,
	winners: [string, number][],
	bestCalls: RecapCall[] = [],
): RecordBookRecap {
	const week = weekContaining(new Date(FIRST.getTime() + n * WEEK_MS))
	return {
		shareToken: `token-${n}`,
		weekKey: week.key,
		weekStart: week.start,
		weekEnd: week.end,
		playersOfTheWeek: winners.map(([userId, points]) => ({
			userId,
			points,
			wins: 3,
			losses: 1,
		})),
		bestCalls,
	}
}

const bestCall = (userId: string, points: number): RecapCall => ({
	userId,
	callId: `call-${userId}-${points}`,
	questionId: "q",
	leagueId: "nfl",
	points,
})

const everyone = new Set(["a", "b", "c"])

describe("compileRecordBook", () => {
	it("lists every week from the first recap to the latest, newest first", () => {
		const book = compileRecordBook(
			[recap(0, [["a", 40]]), recap(3, [])],
			everyone,
		)
		expect(
			book.weeks.map((w) => [w.week.key, w.shareToken, w.players.length]),
		).toEqual([
			["2026-10-06", "token-3", 0],
			["2026-09-29", null, 0],
			["2026-09-22", null, 0],
			["2026-09-15", "token-0", 1],
		])
	})

	it("ends a run of awards at a week somebody else won or nobody recapped", () => {
		const book = compileRecordBook(
			[
				recap(0, [["a", 40]]),
				recap(1, [["a", 30]]),
				recap(2, [
					["a", 20],
					["b", 20],
				]),
				recap(3, [["b", 50]]),
				// Week 4 has no recap.
				recap(5, [["b", 10]]),
			],
			everyone,
		)
		expect(
			book.mostConsecutivePlayerOfTheWeekAwards.map((r) => [
				r.userId,
				r.length,
				r.first.key,
				r.last.key,
			]),
		).toEqual([
			["a", 3, "2026-09-15", "2026-09-29"],
			["b", 2, "2026-09-29", "2026-10-06"],
		])
		expect(book.mostPlayerOfTheWeekAwards).toEqual([
			{ userId: "a", count: 3 },
			{ userId: "b", count: 3 },
		])
	})

	it("keeps the best weeks and calls across every recap", () => {
		const book = compileRecordBook(
			[
				recap(0, [["a", 40]], [bestCall("a", 90), bestCall("b", 30)]),
				recap(1, [["b", 75]], [bestCall("c", 60)]),
			],
			everyone,
		)
		expect(book.mostPointsInAWeek.map((s) => [s.userId, s.points])).toEqual([
			["b", 75],
			["a", 40],
		])
		expect(book.mostPointsOnACall.map((c) => [c.userId, c.points])).toEqual([
			["a", 90],
			["c", 60],
			["b", 30],
		])
	})

	it("keeps hidden members off the records but not out of the weeks", () => {
		const book = compileRecordBook(
			[recap(0, [["a", 40]], [bestCall("a", 90)]), recap(1, [["a", 30]])],
			new Set(["b"]),
		)
		expect(book.weeks.map((w) => w.players.map((p) => p.userId))).toEqual([
			["a"],
			["a"],
		])
		expect(book.mostPointsInAWeek).toEqual([])
		expect(book.mostPointsOnACall).toEqual([])
		expect(book.mostPlayerOfTheWeekAwards).toEqual([])
		expect(book.mostConsecutivePlayerOfTheWeekAwards).toEqual([])
	})

	it("is empty before the group's first recap", () => {
		expect(compileRecordBook([], everyone).weeks).toEqual([])
	})
})

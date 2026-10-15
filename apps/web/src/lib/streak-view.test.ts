import { describe, expect, it } from "vitest"
import { formatCallDate } from "./format-date"
import { describeStreak, type Streak } from "./streak-view"

const call = (id: string, createdAt: string, totalPoints: number | null) => ({
	id,
	createdAt,
	totalPoints,
})

function makeStreak(overrides: Partial<Record<keyof Streak, unknown>>): Streak {
	return {
		family: "WINNERS",
		familyLabel: "Winners",
		currentLength: 0,
		bestLength: 0,
		bestIsCurrent: false,
		nextMilestone: null,
		currentColdLength: 0,
		worstColdLength: 0,
		worstColdIsCurrent: false,
		coldStartedAt: null,
		currentRunBonus: 0,
		bestRunBonus: 0,
		league: { id: "l1", abbreviation: "nfl", slug: "nfl" },
		currentRunCalls: [],
		bestRunCalls: [],
		coldRunCalls: [],
		worstColdRunCalls: [],
		...overrides,
	} as unknown as Streak
}

describe("describeStreak", () => {
	it("leads with the live hot run and its milestone", () => {
		const view = describeStreak(
			makeStreak({
				currentLength: 3,
				bestLength: 5,
				nextMilestone: 5,
				currentRunBonus: 4,
				bestRunBonus: 9,
				currentRunCalls: [
					call("a", "2026-10-01T18:00:00.000Z", 10),
					call("b", "2026-10-02T18:00:00.000Z", null),
					call("c", "2026-10-03T18:00:00.000Z", 15),
				],
				bestRunCalls: [call("x", "2026-09-01T18:00:00.000Z", 50)],
			}),
			"hot",
		)
		expect(view).toEqual({
			mode: "hot",
			runPoints: 25,
			runBonus: 4,
			nextMilestone: 5,
			track: "NFL Winners",
			runStartedAt: formatCallDate("2026-10-01T18:00:00.000Z"),
			lastCall: call("c", "2026-10-03T18:00:00.000Z", 15),
		})
	})

	it("falls back to the best run once the live one has ended, with no milestone", () => {
		const view = describeStreak(
			makeStreak({
				bestLength: 2,
				nextMilestone: 5,
				currentRunBonus: 4,
				bestRunBonus: 9,
				bestRunCalls: [
					call("x", "2026-09-01T18:00:00.000Z", 20),
					call("y", "2026-09-02T18:00:00.000Z", 30),
				],
			}),
			"hot",
		)
		expect(view).toMatchObject({
			mode: "hot",
			runPoints: 50,
			runBonus: 9,
			nextMilestone: null,
			lastCall: { id: "y" },
		})
	})

	it("reads the cold side without a bonus, live run first", () => {
		const live = describeStreak(
			makeStreak({
				currentColdLength: 3,
				worstColdLength: 4,
				coldRunCalls: [call("m", "2026-10-05T18:00:00.000Z", -10)],
				worstColdRunCalls: [call("w", "2026-08-01T18:00:00.000Z", -40)],
			}),
			"cold",
		)
		expect(live).toMatchObject({
			mode: "cold",
			runPoints: -10,
			runBonus: null,
			nextMilestone: null,
			lastCall: { id: "m" },
		})

		const ended = describeStreak(
			makeStreak({
				worstColdLength: 4,
				worstColdRunCalls: [call("w", "2026-08-01T18:00:00.000Z", -40)],
			}),
			"cold",
		)
		expect(ended).toMatchObject({ mode: "cold", lastCall: { id: "w" } })
	})

	it("is null when neither side clears its floor", () => {
		expect(
			describeStreak(makeStreak({ bestLength: 1, worstColdLength: 2 }), "hot"),
		).toBeNull()
	})

	it("has no start date or last call for an empty run", () => {
		expect(describeStreak(makeStreak({ bestLength: 2 }), "hot")).toMatchObject({
			runPoints: 0,
			runStartedAt: null,
			lastCall: null,
		})
	})
})

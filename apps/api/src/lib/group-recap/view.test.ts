import { describe, expect, it } from "vitest"
import type { GroupRecapData, RecapCall, RecapMoment } from "./types"
import { RECAP_MOMENTS_SHOWN, selectRecapSlots } from "./view"

const recapCall = (userId: string, points: number): RecapCall => ({
	userId,
	callId: `call-${userId}-${points}`,
	questionId: "q",
	leagueId: "nfl",
	points,
})

function data(overrides: Partial<GroupRecapData> = {}): GroupRecapData {
	return {
		record: { wins: 3, losses: 2, activeMembers: 3 },
		playersOfTheWeek: [{ userId: "a", points: 52, wins: 4, losses: 1 }],
		bestCalls: [recapCall("a", 40), recapCall("b", 20)],
		worstMisses: [recapCall("c", -30), recapCall("b", -10)],
		moments: [],
		standings: [],
		movers: [],
		...overrides,
	}
}

const everyone = new Set(["a", "b", "c", "d"])

describe("selectRecapSlots", () => {
	it("hands an opted-out member's slot to the next candidate", () => {
		const picked = selectRecapSlots(data(), {
			visible: new Set(["b", "c"]),
			showWorstMiss: true,
		})
		expect(picked.best.map((c) => c.userId)).toEqual(["b"])
		expect(picked.worst.map((c) => c.userId)).toEqual(["c"])
	})

	it("leaves Player of the Week empty rather than handing it down", () => {
		const picked = selectRecapSlots(data(), {
			visible: new Set(["b", "c"]),
			showWorstMiss: true,
		})
		expect(picked.playersOfTheWeek).toEqual([])
		expect(
			selectRecapSlots(data(), { visible: everyone, showWorstMiss: true })
				.playersOfTheWeek,
		).toEqual([{ userId: "a", points: 52, wins: 4, losses: 1 }])
	})

	it("shows every call tied for best or worst", () => {
		const picked = selectRecapSlots(
			data({
				bestCalls: [recapCall("a", 40), recapCall("b", 40), recapCall("c", 20)],
				worstMisses: [recapCall("c", -30), recapCall("d", -30)],
			}),
			{ visible: everyone, showWorstMiss: true },
		)
		expect(picked.best.map((c) => c.userId)).toEqual(["a", "b"])
		expect(picked.worst.map((c) => c.userId)).toEqual(["c", "d"])
	})

	it("hides the worst miss when the group turned it off", () => {
		const picked = selectRecapSlots(data(), {
			visible: everyone,
			showWorstMiss: false,
		})
		expect(picked.worst).toEqual([])
	})

	it("leads with the rarest moments and stops at the limit", () => {
		const moments: RecapMoment[] = [
			{
				kind: "longest_streak",
				userId: "a",
				leagueId: "nfl",
				family: "winners",
				length: 6,
			},
			{ kind: "called_early", ...recapCall("b", 12), daysAhead: 4 },
			{
				kind: "sweep",
				userId: "c",
				leagueId: "nfl",
				slateKey: "k",
				gameCount: 8,
			},
		]
		const picked = selectRecapSlots(data({ moments }), {
			visible: everyone,
			showWorstMiss: true,
		})
		expect(picked.moments.map((m) => m.kind)).toEqual(["sweep", "called_early"])
		expect(picked.moments).toHaveLength(RECAP_MOMENTS_SHOWN)
	})

	it("shows a group miss whoever opted out, since it names nobody", () => {
		const moments: RecapMoment[] = [
			{
				kind: "consensus_miss",
				questionId: "q",
				leagueId: "nfl",
				optionId: "o",
				wrongCount: 3,
				callerCount: 4,
			},
		]
		const picked = selectRecapSlots(data({ moments }), {
			visible: new Set(),
			showWorstMiss: true,
		})
		expect(picked.moments.map((m) => m.kind)).toEqual(["consensus_miss"])
	})

	it("picks the biggest climb and the biggest slide among visible members", () => {
		const picked = selectRecapSlots(
			data({
				movers: [
					{ userId: "a", from: 4, to: 1 },
					{ userId: "b", from: 3, to: 2 },
					{ userId: "c", from: 1, to: 4 },
					{ userId: "d", from: 2, to: 3 },
				],
			}),
			{ visible: new Set(["b", "c", "d"]), showWorstMiss: true },
		)
		expect(picked.climber?.userId).toBe("b")
		expect(picked.slide?.userId).toBe("c")
	})
})

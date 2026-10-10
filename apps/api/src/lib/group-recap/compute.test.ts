import { describe, expect, it } from "vitest"
import { DAY_MS } from "../time"
import {
	CALLED_EARLY_MIN_DAYS,
	computeRecap,
	type RecapCallInput,
	type RecapInput,
} from "./compute"
import type { RecapMoment } from "./types"

const LOCK = new Date("2026-10-11T17:00:00Z")

let nextId = 0
function call(overrides: Partial<RecapCallInput> = {}): RecapCallInput {
	nextId++
	return {
		callId: `call-${String(nextId).padStart(3, "0")}`,
		userId: "a",
		questionId: `q-${nextId}`,
		leagueId: "nfl",
		outcome: "win",
		points: 10,
		optionId: null,
		createdAt: new Date(LOCK.getTime() - 3 * 60 * 60 * 1000),
		locksAt: LOCK,
		redo: null,
		...overrides,
	}
}

function input(overrides: Partial<RecapInput> = {}): RecapInput {
	return {
		calls: [
			call({ userId: "a" }),
			call({ userId: "b", outcome: "loss", points: -5 }),
		],
		fadeWins: [],
		sweeps: [],
		snaps: [],
		activeStreaks: [],
		standings: [],
		previousStandings: null,
		...overrides,
	}
}

const kinds = (moments: RecapMoment[]) => moments.map((m) => m.kind)

describe("computeRecap", () => {
	it("needs two members with a settled call", () => {
		expect(
			computeRecap(
				input({ calls: [call({ userId: "a" }), call({ userId: "a" })] }),
			),
		).toBeNull()
		expect(computeRecap(input())).not.toBeNull()
	})

	it("counts the week's record across every member", () => {
		const data = computeRecap(
			input({
				calls: [
					call({ userId: "a" }),
					call({ userId: "b" }),
					call({ userId: "c", outcome: "loss", points: -4 }),
				],
			}),
		)
		expect(data?.record).toEqual({ wins: 2, losses: 1, activeMembers: 3 })
	})

	it("ranks best calls by points up and worst misses by points down", () => {
		const data = computeRecap(
			input({
				calls: [
					call({ userId: "a", points: 12 }),
					call({ userId: "b", points: 40 }),
					call({ userId: "c", outcome: "loss", points: -8 }),
					call({ userId: "d", outcome: "loss", points: -30 }),
				],
			}),
		)
		expect(data?.bestCalls.map((c) => c.points)).toEqual([40, 12])
		expect(data?.worstMisses.map((c) => c.points)).toEqual([-30, -8])
	})

	it("keeps every call tied for best, however deep the tie runs", () => {
		const tied = ["a", "b", "c", "d", "e", "f", "g"].map((userId) =>
			call({ userId, points: 25 }),
		)
		const data = computeRecap(input({ calls: tied }))
		expect(data?.bestCalls).toHaveLength(tied.length)
	})

	it("finds the one member who got a crowded question right", () => {
		const data = computeRecap(
			input({
				calls: [
					call({ userId: "a", questionId: "q", optionId: "x", points: 25 }),
					call({
						userId: "b",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
					call({
						userId: "c",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
				],
			}),
		)
		const lone = data?.moments.find((m) => m.kind === "lone_correct")
		expect(lone).toMatchObject({ userId: "a", callerCount: 3 })
	})

	it("flags most of the group on the same wrong pick", () => {
		const data = computeRecap(
			input({
				calls: [
					call({
						userId: "a",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
					call({
						userId: "b",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
					call({
						userId: "c",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
					call({ userId: "d", questionId: "q", optionId: "x", points: 9 }),
				],
			}),
		)
		expect(
			data?.moments.find((m) => m.kind === "consensus_miss"),
		).toMatchObject({
			questionId: "q",
			optionId: "y",
			wrongCount: 3,
			callerCount: 4,
		})
	})

	it("needs a crowd for either crowd moment", () => {
		const data = computeRecap(
			input({
				calls: [
					call({ userId: "a", questionId: "q", optionId: "x" }),
					call({
						userId: "b",
						questionId: "q",
						optionId: "y",
						outcome: "loss",
						points: -5,
					}),
				],
			}),
		)
		expect(kinds(data?.moments ?? [])).not.toContain("lone_correct")
		expect(kinds(data?.moments ?? [])).not.toContain("consensus_miss")
	})

	it("splits redos by whether the replaced pick would have hit", () => {
		const data = computeRecap(
			input({
				calls: [
					call({
						userId: "a",
						outcome: "loss",
						points: -20,
						redo: { originalWon: true },
					}),
					call({
						userId: "b",
						outcome: "win",
						points: 15,
						redo: { originalWon: false },
					}),
					// Redid off a miss onto another miss: neither moment.
					call({
						userId: "c",
						outcome: "loss",
						points: -3,
						redo: { originalWon: false },
					}),
				],
			}),
		)
		const moments = data?.moments ?? []
		expect(moments.filter((m) => m.kind === "redo_backfired")).toHaveLength(1)
		expect(moments.find((m) => m.kind === "redo_backfired")).toMatchObject({
			userId: "a",
		})
		expect(moments.find((m) => m.kind === "redo_paid_off")).toMatchObject({
			userId: "b",
		})
	})

	it("only counts an early call that hit, far enough ahead", () => {
		const early = new Date(
			LOCK.getTime() - (CALLED_EARLY_MIN_DAYS + 3) * DAY_MS,
		)
		const data = computeRecap(
			input({
				calls: [
					call({ userId: "a", createdAt: early }),
					call({ userId: "b", createdAt: early, outcome: "loss", points: -5 }),
					call({ userId: "c", createdAt: new Date(LOCK.getTime() - DAY_MS) }),
				],
			}),
		)
		const early_ = (data?.moments ?? []).filter(
			(m) => m.kind === "called_early",
		)
		expect(early_).toHaveLength(1)
		expect(early_[0]).toMatchObject({ userId: "a", daysAhead: 5 })
	})

	it("keeps a fade only when its call is in the week", () => {
		const fader = call({ userId: "a", points: 18 })
		const data = computeRecap(
			input({
				calls: [fader, call({ userId: "b", outcome: "loss", points: -5 })],
				fadeWins: [
					{ faderCallId: fader.callId, targetUserId: "b" },
					{ faderCallId: "not-this-week", targetUserId: "b" },
				],
			}),
		)
		const fades = (data?.moments ?? []).filter((m) => m.kind === "fade_hit")
		expect(fades).toEqual([
			expect.objectContaining({ userId: "a", targetUserId: "b", points: 18 }),
		])
	})

	it("reads movers against the previous recap's board", () => {
		const data = computeRecap(
			input({
				standings: [
					{ userId: "a", rank: 1 },
					{ userId: "b", rank: 2 },
					{ userId: "c", rank: 3 },
				],
				previousStandings: [
					{ userId: "a", rank: 3 },
					{ userId: "b", rank: 2 },
					{ userId: "c", rank: 1 },
				],
			}),
		)
		expect(data?.movers).toEqual([
			{ userId: "a", from: 3, to: 1 },
			{ userId: "c", from: 1, to: 3 },
		])
	})

	it("has no movers on a group's first recap", () => {
		const data = computeRecap(
			input({ standings: [{ userId: "a", rank: 1 }], previousStandings: null }),
		)
		expect(data?.movers).toEqual([])
	})
})

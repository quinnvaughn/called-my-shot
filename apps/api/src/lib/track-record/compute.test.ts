import { describe, expect, it } from "vitest"
import {
	buildTrackRecord,
	optionKey,
	TRACK_RECORD_MIN_SETTLED,
	type TrackRecordCall,
	venueKey,
} from "./compute"

let seq = 0

const OVER = { key: "label:over", label: "Over" }
const UNDER = { key: "label:under", label: "Under" }
const SIDES = [OVER, UNDER]

// A settled, winning Over by default. Every test overrides only the field it
// is about.
function call(overrides: Partial<TrackRecordCall> = {}): TrackRecordCall {
	seq += 1
	return {
		callId: `call-${seq}`,
		gameId: null,
		shape: "team_stat_over_under",
		status: "resolved",
		unscoredReason: null,
		hitTolerance: null,
		lossRate: 1,
		netPoints: 50,
		convictions: [50],
		selectionsCorrect: [true],
		selectionLossRates: [null],
		createdAt: new Date(`2026-09-20T12:00:${String(seq).padStart(2, "0")}Z`),
		sideKeys: [OVER.key],
		...overrides,
	}
}

const loss = (overrides: Partial<TrackRecordCall> = {}) =>
	call({ netPoints: -40, selectionsCorrect: [false], ...overrides })

const times = (n: number, make: () => TrackRecordCall) =>
	Array.from({ length: n }, make)

describe("optionKey", () => {
	it("keys a team or player option by who it is, not its label", () => {
		expect(
			optionKey({ label: "Bengals", teamId: "t1", playerId: null }),
		).toBe(optionKey({ label: "CIN", teamId: "t1", playerId: null }))
		expect(optionKey({ label: "Allen", teamId: null, playerId: "p1" })).toBe(
			"player:p1",
		)
	})

	it("keys a plain option by its label, ignoring case and spacing", () => {
		expect(optionKey({ label: " Yes", teamId: null, playerId: null })).toBe(
			optionKey({ label: "yes", teamId: null, playerId: null }),
		)
	})
})

describe("venueKey", () => {
	const game = { homeTeamId: "h", awayTeamId: "a" }

	it("names which end of the game a team is", () => {
		expect(venueKey("h", game)).toBe("venue:home")
		expect(venueKey("a", game)).toBe("venue:away")
	})

	it("is null off the game or without a team", () => {
		expect(venueKey("x", game)).toBeNull()
		expect(venueKey(null, game)).toBeNull()
		expect(venueKey("h", null)).toBeNull()
	})
})

describe("buildTrackRecord", () => {
	it("splits wins, losses and net points by side, in the order given", () => {
		const record = buildTrackRecord(
			[
				call(),
				loss(),
				loss(),
				call({ sideKeys: [UNDER.key] }),
				call({ sideKeys: [UNDER.key] }),
				loss({ sideKeys: [UNDER.key] }),
			],
			SIDES,
		)
		expect(record).toEqual([
			{ label: "Over", wins: 1, losses: 2, netPoints: -30 },
			{ label: "Under", wins: 2, losses: 1, netPoints: 60 },
		])
	})

	it("leaves out a side below the sample floor", () => {
		const record = buildTrackRecord(
			[
				...times(TRACK_RECORD_MIN_SETTLED, () => call()),
				...times(TRACK_RECORD_MIN_SETTLED - 1, () =>
					call({ sideKeys: [UNDER.key] }),
				),
			],
			SIDES,
		)
		expect(record.map((r) => r.label)).toEqual(["Over"])
	})

	it("counts only settled calls toward the floor", () => {
		const record = buildTrackRecord(
			[
				call(),
				call(),
				call({ status: "open", netPoints: null, selectionsCorrect: [] }),
				call({ status: "voided", netPoints: null }),
				call({ unscoredReason: "question_voided", netPoints: null }),
			],
			SIDES,
		)
		expect(record).toEqual([])
	})

	it("ignores calls on neither side", () => {
		const record = buildTrackRecord(
			[
				...times(TRACK_RECORD_MIN_SETTLED, () => call({ sideKeys: [] })),
				...times(TRACK_RECORD_MIN_SETTLED, () =>
					call({ sideKeys: ["team:someone-else"] }),
				),
			],
			SIDES,
		)
		expect(record).toEqual([])
	})
})

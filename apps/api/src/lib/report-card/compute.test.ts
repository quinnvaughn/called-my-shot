import { REPORT_CARD_MIN_SETTLED } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { buildReportCard, type ReportCardCall } from "./compute"

let seq = 0

// A settled, winning 2-option call by default. Every test overrides only the
// field it is about.
function call(overrides: Partial<ReportCardCall> = {}): ReportCardCall {
	seq += 1
	return {
		callId: `call-${seq}`,
		shape: "team_vs_team",
		status: "resolved",
		unscoredReason: null,
		hitTolerance: null,
		lossRate: 1,
		netPoints: 75,
		convictions: [50],
		selectionsCorrect: [true],
		selectionLossRates: [null],
		createdAt: new Date(`2026-09-20T12:00:${String(seq).padStart(2, "0")}Z`),
		...overrides,
	}
}

const loss = (overrides: Partial<ReportCardCall> = {}) =>
	call({ netPoints: -75, selectionsCorrect: [false], ...overrides })

const pending = (overrides: Partial<ReportCardCall> = {}) =>
	call({ status: "open", netPoints: null, selectionsCorrect: [], ...overrides })

describe("what counts", () => {
	it("drops a voided question entirely, not as a loss", () => {
		const card = buildReportCard([
			call(),
			call({ status: "voided", netPoints: null }),
		])
		expect(card.settledCount).toBe(1)
		expect(card.losses).toBe(0)
		expect(card.pendingCount).toBe(0)
		// 150 base x 50 conviction, once - the voided call contributes nothing
		// to the denominator either.
		expect(card.committedPoints).toBe(75)
	})

	it("drops an unscored call, both reasons", () => {
		const card = buildReportCard([
			call(),
			call({ unscoredReason: "question_voided", netPoints: null }),
			call({ unscoredReason: "creator_sole_caller", netPoints: null }),
		])
		expect(card.settledCount).toBe(1)
		expect(card.pendingCount).toBe(0)
	})

	it("counts an open call as pending, with its stake but not its commitment", () => {
		const card = buildReportCard([call(), pending()])
		expect(card.settledCount).toBe(1)
		expect(card.pendingCount).toBe(1)
		expect(card.committedPoints).toBe(75)
		// lossRate 1, so the stake equals the commitment for this shape.
		expect(card.pendingStake).toBe(75)
	})

	it("counts a locked call as pending too", () => {
		const card = buildReportCard([pending({ status: "locked" })])
		expect(card.pendingCount).toBe(1)
		expect(card.settledCount).toBe(0)
	})

	it("counts a disputed call that still carries a result", () => {
		// Filing a dispute must not freeze a window's grade.
		const card = buildReportCard([call({ status: "disputed" })])
		expect(card.settledCount).toBe(1)
		expect(card.wins).toBe(1)
	})

	it("treats a resolved question with no correctness yet as pending", () => {
		const card = buildReportCard([
			call({ status: "resolved", selectionsCorrect: [null], netPoints: null }),
		])
		expect(card.pendingCount).toBe(1)
		expect(card.settledCount).toBe(0)
	})
})

describe("the return", () => {
	it("divides net by committed, ignoring pending commitment", () => {
		// Two wins and two losses at 150 base / 50 conviction: committed 300,
		// net 0. The pending call must not move it.
		const card = buildReportCard([call(), call(), loss(), loss(), pending()])
		expect(card.committedPoints).toBe(300)
		expect(card.netPoints).toBe(0)
		expect(card.returnPct).toBe(0)
	})

	it("is null when every call is still pending", () => {
		const card = buildReportCard([pending(), pending()])
		expect(card.returnPct).toBeNull()
		expect(card.grade).toBeNull()
		expect(card.isFinal).toBe(false)
	})

	it("sums committed per selection, not off a summed conviction", () => {
		// Two selections at 33 each: round(150 x .33) x 2 = 50 x 2 = 100, which
		// is what selectionPoints would charge. Summing first would give
		// round(150 x .66) = 99.
		const card = buildReportCard([
			call({ convictions: [33, 33], selectionsCorrect: [true, true] }),
		])
		expect(card.committedPoints).toBe(100)
	})

	it("uses the question's own loss rate for pending stake, not the shape default", () => {
		// A tuned question carries its own rate; 150 x .5 x .5 = 38.
		const card = buildReportCard([pending({ lossRate: 0.5 })])
		expect(card.pendingStake).toBe(38)
	})

	it("uses a priced side's own rate for pending stake", () => {
		// 150 x .5 x 1.5 = 113 on the priced side, over the question's 1.
		const card = buildReportCard([pending({ selectionLossRates: [1.5] })])
		expect(card.pendingStake).toBe(113)
	})
})

describe("the grade", () => {
	it("is withheld below the sample floor, while the record still counts", () => {
		const calls = Array.from({ length: REPORT_CARD_MIN_SETTLED - 1 }, () =>
			call(),
		)
		const card = buildReportCard(calls)
		expect(card.settledCount).toBe(REPORT_CARD_MIN_SETTLED - 1)
		expect(card.wins).toBe(REPORT_CARD_MIN_SETTLED - 1)
		expect(card.returnPct).toBe(100)
		expect(card.grade).toBeNull()
	})

	it("appears once the floor is met", () => {
		const calls = Array.from({ length: REPORT_CARD_MIN_SETTLED }, () => call())
		expect(buildReportCard(calls).grade).toBe("A+")
	})
})

describe("isFinal", () => {
	it("is false while anything is pending and true once nothing is", () => {
		expect(buildReportCard([call(), pending()]).isFinal).toBe(false)
		expect(buildReportCard([call(), call()]).isFinal).toBe(true)
	})

	it("is false for a window with no settled calls at all", () => {
		expect(buildReportCard([]).isFinal).toBe(false)
	})
})

describe("biggest hit and biggest miss", () => {
	it("picks the highest win and the most negative loss", () => {
		const card = buildReportCard([
			call({ callId: "small-win", netPoints: 40 }),
			call({ callId: "big-win", netPoints: 430 }),
			loss({ callId: "small-loss", netPoints: -20 }),
			loss({ callId: "big-loss", netPoints: -180 }),
		])
		expect(card.biggestHitCallId).toBe("big-win")
		expect(card.biggestMissCallId).toBe("big-loss")
	})

	it("leaves a side null when the window has none of it", () => {
		const unbeaten = buildReportCard([call(), call()])
		expect(unbeaten.biggestHitCallId).not.toBeNull()
		expect(unbeaten.biggestMissCallId).toBeNull()

		const winless = buildReportCard([loss(), loss()])
		expect(winless.biggestHitCallId).toBeNull()
		expect(winless.biggestMissCallId).not.toBeNull()
	})

	it("never picks a pending, voided or unscored call", () => {
		const card = buildReportCard([
			pending({ callId: "pending", netPoints: null }),
			call({ callId: "voided", status: "voided", netPoints: 9999 }),
			call({
				callId: "unscored",
				unscoredReason: "creator_sole_caller",
				netPoints: 9999,
			}),
			call({ callId: "real", netPoints: 10 }),
		])
		expect(card.biggestHitCallId).toBe("real")
	})

	it("breaks a tie the same way on every read", () => {
		const tied = [
			call({
				callId: "zzz",
				netPoints: 100,
				createdAt: new Date("2026-09-20T12:00:00Z"),
			}),
			call({
				callId: "aaa",
				netPoints: 100,
				createdAt: new Date("2026-09-20T12:00:00Z"),
			}),
		]
		expect(buildReportCard(tied).biggestHitCallId).toBe("aaa")
		expect(buildReportCard([...tied].reverse()).biggestHitCallId).toBe("aaa")
	})

	it("prefers the earlier call when points are equal", () => {
		const card = buildReportCard([
			call({
				callId: "later",
				netPoints: 100,
				createdAt: new Date("2026-09-20T18:00:00Z"),
			}),
			call({
				callId: "earlier",
				netPoints: 100,
				createdAt: new Date("2026-09-20T09:00:00Z"),
			}),
		])
		expect(card.biggestHitCallId).toBe("earlier")
	})
})

describe("the breakdown", () => {
	it("groups by family in a fixed order, emitting only families with a call", () => {
		const card = buildReportCard([
			call({ shape: "yes_no_prop" }),
			call({ shape: "player_stat_over_under" }),
			loss({ shape: "team_vs_team" }),
		])
		// SHAPE_FAMILIES order is OVER_UNDER, NUMERIC_GUESS, HEAD_TO_HEAD,
		// STAT_LEADER, AWARD, YES_NO - not the order the calls arrived in, and
		// not by volume, so rows don't reshuffle as a slate settles.
		expect(card.byFamily.map((r) => r.family)).toStrictEqual([
			"OVER_UNDER",
			"HEAD_TO_HEAD",
			"YES_NO",
		])
	})

	it("splits a family into its shapes, each naming its family", () => {
		const card = buildReportCard([
			call({ shape: "player_stat_over_under" }),
			loss({ shape: "team_stat_over_under" }),
		])
		expect(card.byShape).toHaveLength(2)
		expect(card.byShape.every((r) => r.family === "OVER_UNDER")).toBe(true)
		expect(card.byShape.map((r) => r.shape).sort()).toStrictEqual([
			"player_stat_over_under",
			"team_stat_over_under",
		])
	})

	it("has family rows that sum back to the totals", () => {
		const calls = [
			call({ shape: "yes_no_prop" }),
			loss({ shape: "player_stat_over_under" }),
			call({ shape: "team_vs_team" }),
			pending({ shape: "team_vs_team" }),
		]
		const card = buildReportCard(calls)
		const summed = card.byFamily.reduce(
			(acc, row) => ({
				settled: acc.settled + row.settledCount,
				net: acc.net + row.netPoints,
				committed: acc.committed + row.committedPoints,
				pending: acc.pending + row.pendingCount,
			}),
			{ settled: 0, net: 0, committed: 0, pending: 0 },
		)
		expect(summed.settled).toBe(card.settledCount)
		expect(summed.net).toBe(card.netPoints)
		expect(summed.committed).toBe(card.committedPoints)
		expect(summed.pending).toBe(card.pendingCount)
	})

	it("is empty for a window with no calls", () => {
		const card = buildReportCard([])
		expect(card.byFamily).toStrictEqual([])
		expect(card.byShape).toStrictEqual([])
		expect(card.settledCount).toBe(0)
		expect(card.returnPct).toBeNull()
	})
})

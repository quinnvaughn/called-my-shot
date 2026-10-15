import { describe, expect, it } from "vitest"
import {
	disputeAction,
	numericRowResult,
	resultFace,
	seasonPlayLine,
	selectionRowResult,
	seriesStageLine,
	underdogMath,
	viewerStatus,
	voidedText,
} from "./viewer-status"

const call = (totalPoints: number | null) => ({ totalPoints })

describe("viewerStatus", () => {
	it("buckets an uncalled question by phase", () => {
		expect(viewerStatus("open", null)).toEqual({ kind: "canCall" })
		expect(viewerStatus("locked", undefined)).toEqual({ kind: "lockedNoCall" })
		expect(viewerStatus("resolved", null)).toEqual({
			kind: "resolvedNoCall",
			disputed: false,
		})
		expect(viewerStatus("disputed", null)).toEqual({
			kind: "resolvedNoCall",
			disputed: true,
		})
	})

	it("keeps a called, unsettled question pending whether or not it has locked", () => {
		const pending = call(null)
		expect(viewerStatus("open", pending)).toEqual({
			kind: "pending",
			call: pending,
			isLocked: false,
		})
		expect(viewerStatus("locked", pending)).toEqual({
			kind: "pending",
			call: pending,
			isLocked: true,
		})
	})

	it("grades a called, settled question off its points", () => {
		const won = call(120)
		expect(viewerStatus("resolved", won)).toEqual({
			kind: "resolved",
			call: won,
			disputed: false,
			result: { status: "win", points: 120 },
		})
		const lost = call(-80)
		expect(viewerStatus("disputed", lost)).toEqual({
			kind: "resolved",
			call: lost,
			disputed: true,
			result: { status: "loss", points: -80 },
		})
		// Settled, but the call's points haven't been written yet.
		const unscored = call(null)
		expect(viewerStatus("resolved", unscored)).toEqual({
			kind: "resolved",
			call: unscored,
			disputed: false,
			result: { status: "pending" },
		})
	})

	it("marks a call resolution left out of scoring as unscored", () => {
		const excluded = {
			totalPoints: null,
			unscoredReason: "CREATOR_SOLE_CALLER",
		}
		expect(viewerStatus("resolved", excluded)).toEqual({
			kind: "resolved",
			call: excluded,
			disputed: false,
			result: { status: "unscored" },
		})
	})

	it("reads a voided question the same whether or not it was called", () => {
		const called = call(null)
		expect(viewerStatus("voided", null)).toEqual({ kind: "voided", call: null })
		expect(viewerStatus("voided", called)).toEqual({
			kind: "voided",
			call: called,
		})
	})
})

describe("disputeAction", () => {
	const none = { hasSettledDispute: false, hasViewerDispute: false }

	it("is hidden until the question settles", () => {
		expect(disputeAction(viewerStatus("open", null), none)).toBe("hidden")
		expect(disputeAction(viewerStatus("locked", null), none)).toBe("hidden")
		expect(disputeAction(viewerStatus("locked", call(null)), none)).toBe(
			"hidden",
		)
	})

	it("offers a dispute on a settled question, called or not", () => {
		expect(disputeAction(viewerStatus("resolved", null), none)).toBe(
			"available",
		)
		expect(disputeAction(viewerStatus("resolved", call(50)), none)).toBe(
			"available",
		)
	})

	it("shows the viewer's own dispute as under review", () => {
		expect(
			disputeAction(viewerStatus("resolved", null), {
				hasSettledDispute: false,
				hasViewerDispute: true,
			}),
		).toBe("underReview")
	})

	it("is hidden on a voided question", () => {
		expect(disputeAction(viewerStatus("voided", call(null)), none)).toBe(
			"hidden",
		)
	})

	it("is hidden while disputed and once a dispute has settled", () => {
		expect(disputeAction(viewerStatus("disputed", call(50)), none)).toBe(
			"hidden",
		)
		expect(
			disputeAction(viewerStatus("resolved", call(50)), {
				hasSettledDispute: true,
				hasViewerDispute: true,
			}),
		).toBe("hidden")
	})
})

describe("voidedText", () => {
	it("names the reason the question was voided", () => {
		expect(voidedText("TIE")).toBe(
			"It ended in a tie, so no call on it scores.",
		)
		expect(voidedText("SUBJECT_DID_NOT_PLAY")).toContain("didn't play")
	})

	it("falls back to a plain line with no specific reason", () => {
		expect(voidedText(null)).toBe("No call on this question scores.")
		expect(voidedText("OTHER")).toBe("No call on this question scores.")
	})
})

describe("resultFace", () => {
	it("reads a win and a loss with their points", () => {
		expect(resultFace({ status: "win", points: 120 }, null)).toEqual({
			tone: "success",
			label: "Won",
			outcome: { isWin: true, points: 120 },
		})
		expect(resultFace({ status: "loss", points: -40 }, null)).toEqual({
			tone: "danger",
			label: "Missed",
			outcome: { isWin: false, points: -40 },
		})
	})

	it("lets the margin label stand in for the verdict word", () => {
		expect(
			resultFace({ status: "loss", points: -40 }, "Inches away").label,
		).toBe("Inches away")
	})

	it("has nothing to share before points are written or when unscored", () => {
		expect(resultFace({ status: "pending" }, "Inches away")).toEqual({
			tone: "neutral",
			label: "Pending",
			outcome: null,
		})
		expect(resultFace({ status: "unscored" }, null)).toEqual({
			tone: "neutral",
			label: "Not scored",
			outcome: null,
		})
	})
})

describe("selectionRowResult", () => {
	const selection = (
		isCorrect: boolean | null,
		resultPoints: number | null,
	) => ({
		resultPoints,
		option: { isCorrect },
	})

	it("previews until settled and both the result and points are known", () => {
		expect(selectionRowResult(selection(true, 80), false)).toEqual({
			kind: "preview",
		})
		expect(selectionRowResult(selection(null, 80), true)).toEqual({
			kind: "preview",
		})
		expect(selectionRowResult(selection(true, null), true)).toEqual({
			kind: "preview",
		})
	})

	it("reports the stored points once resolved", () => {
		expect(selectionRowResult(selection(false, -30), true)).toEqual({
			kind: "resolved",
			isCorrect: false,
			points: -30,
		})
	})
})

describe("numericRowResult", () => {
	const call = { totalPoints: 90, closenessMult: 1.5, closenessFieldPct: 20 }

	it("previews until settled with points written", () => {
		expect(numericRowResult(call, false)).toEqual({ kind: "preview" })
		expect(numericRowResult({ ...call, totalPoints: null }, true)).toEqual({
			kind: "preview",
		})
	})

	it("carries the persisted closeness values once resolved", () => {
		expect(numericRowResult(call, true)).toEqual({ kind: "resolved", ...call })
	})
})

describe("seasonPlayLine", () => {
	const play = {
		weight: 1,
		weeksPlayed: 4,
		weeksCounted: 4,
		settled: false,
		league: "NFL",
	}

	it("is null off a season-long call", () => {
		expect(seasonPlayLine(null)).toBeNull()
	})

	it("states the settled share and the weeks behind it", () => {
		expect(seasonPlayLine({ ...play, weight: 0.5, settled: true })).toBe(
			"Counted for 50% of its points: you played 4 of 4 NFL weeks.",
		)
	})

	it("counts in full before any weeks are counted", () => {
		expect(seasonPlayLine({ ...play, weeksPlayed: 0, weeksCounted: 0 })).toBe(
			"Counts in full so far. Make 3 NFL game calls a week to keep it there.",
		)
	})

	it("reads the current pace while unsettled", () => {
		expect(seasonPlayLine(play)).toBe(
			"Counts in full at your NFL pace: 4 of 4 NFL weeks played. Make 3 NFL game calls a week to keep it there.",
		)
		expect(seasonPlayLine({ ...play, weight: 0.25, weeksPlayed: 1 })).toBe(
			"Counts for 25% of its points at your NFL pace: 1 of 4 NFL weeks played. Playing more weeks grows it.",
		)
	})
})

describe("underdogMath", () => {
	it("only shows a multiplier above 1x", () => {
		expect(underdogMath(1)).toBe("")
		expect(underdogMath(2.5)).toBe("× 2.5 underdog ")
	})
})

describe("seriesStageLine", () => {
	it("says nothing about a call made before Game 1", () => {
		expect(seriesStageLine({ gamesPlayed: 0, bestOf: 7, weight: 1 })).toBeNull()
		expect(seriesStageLine(null)).toBeNull()
	})

	it("names the game a later call was made before and its share", () => {
		expect(
			seriesStageLine({ gamesPlayed: 2, bestOf: 7, weight: 0.714 }),
		).toBe("Called before Game 3 of 7: counts for 71% of its points.")
	})
})

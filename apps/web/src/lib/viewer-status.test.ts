import { describe, expect, it } from "vitest"
import { disputeAction, viewerStatus } from "./viewer-status"

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

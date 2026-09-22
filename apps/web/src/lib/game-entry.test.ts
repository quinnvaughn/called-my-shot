import { describe, expect, it } from "vitest"
import { viewerGamePicksSummary } from "./game-entry"

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

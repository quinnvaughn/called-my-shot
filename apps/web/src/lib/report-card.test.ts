import { REPORT_CARD_MIN_SETTLED } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import {
	formatReturn,
	gradeTone,
	isEmptyReportCard,
	reportCardStatusLine,
} from "./report-card"

describe("formatReturn", () => {
	it("rounds once, with an explicit sign", () => {
		expect(formatReturn(32.4)).toBe("+32%")
		expect(formatReturn(32.6)).toBe("+33%")
		expect(formatReturn(-14.8)).toBe("−15%")
		expect(formatReturn(0)).toBe("+0%")
	})

	it("is null when nothing was committed", () => {
		expect(formatReturn(null)).toBeNull()
	})
})

describe("gradeTone", () => {
	it("treats C as neutral, not as a result", () => {
		// Break-even is where the loss rates put an average caller, so a C
		// shouldn't read as either good or bad news.
		expect(gradeTone("C")).toBe("fg.default")
		expect(gradeTone("B")).toBe("success.default")
		expect(gradeTone("D")).toBe("danger.default")
	})

	it("is muted when there's no grade", () => {
		expect(gradeTone(null)).toBe("fg.muted")
	})
})

describe("reportCardStatusLine", () => {
	const base = {
		settledCount: 10,
		pendingCount: 0,
		pendingStake: 0,
		isFinal: true,
		grade: "B" as string | null,
	}

	it("names what's still out there while a slate runs", () => {
		expect(
			reportCardStatusLine({
				...base,
				pendingCount: 9,
				pendingStake: 700,
				isFinal: false,
			}),
		).toBe("9 still out there · 700 at risk")
	})

	it("says nothing once the window is final and graded", () => {
		expect(reportCardStatusLine(base)).toBeNull()
	})

	it("explains a blank grade tile rather than leaving it bare", () => {
		const settled = REPORT_CARD_MIN_SETTLED - 2
		expect(
			reportCardStatusLine({
				...base,
				settledCount: settled,
				grade: null,
			}),
		).toBe("2 more results to grade")
	})

	it("uses the singular for one more result", () => {
		expect(
			reportCardStatusLine({
				...base,
				settledCount: REPORT_CARD_MIN_SETTLED - 1,
				grade: null,
			}),
		).toBe("1 more result to grade")
	})

	it("says nothing for an empty window", () => {
		expect(
			reportCardStatusLine({
				settledCount: 0,
				pendingCount: 0,
				pendingStake: 0,
				isFinal: false,
				grade: null,
			}),
		).toBeNull()
	})
})

describe("isEmptyReportCard", () => {
	it("is empty only when nothing settled and nothing is pending", () => {
		expect(isEmptyReportCard({ settledCount: 0, pendingCount: 0 })).toBe(true)
		expect(isEmptyReportCard({ settledCount: 0, pendingCount: 3 })).toBe(false)
		expect(isEmptyReportCard({ settledCount: 3, pendingCount: 0 })).toBe(false)
	})
})

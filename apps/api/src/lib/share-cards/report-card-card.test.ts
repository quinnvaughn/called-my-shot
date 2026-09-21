import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import {
	buildReportCardShareCard,
	type ReportCardShareData,
} from "./report-card-card"

// Fixed 1200x630 like the rest of the set. The breakdown list is the one part
// whose height depends on the data, so what matters is that every family the
// caller played gets a row - an og:image that silently dropped one would be
// stating a partial record as a whole one.

const data = (
	over: Partial<ReportCardShareData> = {},
): ReportCardShareData => ({
	leagueAbbr: "NFL",
	windowLabel: "WEEK 3",
	name: "Quinn Vaughn",
	username: "quinn",
	grade: "B",
	returnPct: 30.4,
	wins: 12,
	losses: 6,
	netPoints: 540,
	committedPoints: 1800,
	pendingCount: 0,
	rows: [
		{ label: "Over/Under", wins: 7, losses: 3, returnPct: 22 },
		{ label: "Head-to-Head", wins: 5, losses: 3, returnPct: 38 },
	],
	...over,
})

describe("buildReportCardShareCard", () => {
	it("fills the fixed og:image size", () => {
		const node = buildReportCardShareCard(data())
		expect(node.props.style?.width).toBe("1200px")
		expect(node.props.style?.height).toBe("630px")
	})

	it("leads with the grade and names the window", () => {
		const text = textNodes(buildReportCardShareCard(data()))
		expect(text).toContain("B")
		expect(text.join(" ")).toContain("NFL · WEEK 3")
		expect(text).toContain("Quinn Vaughn")
		expect(text).toContain("@quinn")
	})

	it("rounds the return exactly once, matching the page", () => {
		const text = textNodes(buildReportCardShareCard(data({ returnPct: 30.4 })))
		expect(text).toContain("+30%")
		const down = textNodes(buildReportCardShareCard(data({ returnPct: -14.8 })))
		expect(down).toContain("-15%")
	})

	it("states the record, net and committed in the footer", () => {
		const text = textNodes(buildReportCardShareCard(data()))
		expect(text).toContain("12-6")
		expect(text).toContain("+540")
		expect(text).toContain("1800")
	})

	it("gives every family a row, however many there are", () => {
		const rows = [
			{ label: "Over/Under", wins: 7, losses: 3, returnPct: 22 },
			{ label: "Head-to-Head", wins: 5, losses: 3, returnPct: 38 },
			{ label: "Numeric Guess", wins: 2, losses: 4, returnPct: -10 },
			{ label: "Stat Leader", wins: 1, losses: 3, returnPct: 5 },
			{ label: "Yes/No", wins: 3, losses: 1, returnPct: 60 },
		]
		const text = textNodes(buildReportCardShareCard(data({ rows })))
		for (const row of rows) {
			expect(text).toContain(row.label)
		}
	})

	it("says a window is still running rather than implying it is final", () => {
		const running = textNodes(
			buildReportCardShareCard(data({ pendingCount: 9 })),
		)
		expect(running).toContain("9 still out there")
		const done = textNodes(buildReportCardShareCard(data({ pendingCount: 0 })))
		expect(done).toContain("Final")
	})

	it("renders a dash, not a blank, for an ungraded window", () => {
		// Under the sample floor the card still exists and still has a record;
		// only the letter is missing.
		const text = textNodes(
			buildReportCardShareCard(data({ grade: null, returnPct: null })),
		)
		expect(text).toContain("-")
		expect(text).toContain("12-6")
	})
})

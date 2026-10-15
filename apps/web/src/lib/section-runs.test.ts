import { describe, expect, it } from "vitest"
import { sectionRuns } from "./section-runs"

function item(id: string, section: string | null) {
	return { id, section }
}

describe("sectionRuns", () => {
	it("returns no runs for an empty list", () => {
		expect(sectionRuns([])).toEqual([])
	})

	it("puts a list with no sections in one null-section run", () => {
		const items = [item("a", null), item("b", null)]
		expect(sectionRuns(items)).toEqual([
			{
				section: null,
				entries: [
					{ item: items[0], index: 0 },
					{ item: items[1], index: 1 },
				],
			},
		])
	})

	it("groups consecutive items and keeps each one's index in the full list", () => {
		const items = [item("a", "East"), item("b", "East"), item("c", "West")]
		const runs = sectionRuns(items)
		expect(runs.map((r) => r.section)).toEqual(["East", "West"])
		expect(runs[1].entries).toEqual([{ item: items[2], index: 2 }])
	})

	it("starts a new run when a section comes round again", () => {
		const items = [item("a", "East"), item("b", "West"), item("c", "East")]
		expect(sectionRuns(items).map((r) => r.section)).toEqual([
			"East",
			"West",
			"East",
		])
	})
})

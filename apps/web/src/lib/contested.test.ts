import { describe, expect, it } from "vitest"
import { leadingOption } from "./contested"

describe("leadingOption", () => {
	it("is null when nobody has called any option", () => {
		expect(leadingOption([{ label: "A", fieldPct: null }])).toBeNull()
		expect(leadingOption([])).toBeNull()
	})

	it("picks the option with the highest field share, skipping uncalled ones", () => {
		const options = [
			{ label: "A", fieldPct: 30 },
			{ label: "B", fieldPct: null },
			{ label: "C", fieldPct: 55 },
			{ label: "D", fieldPct: 15 },
		]
		expect(leadingOption(options)?.label).toBe("C")
	})

	it("keeps the first of a tie", () => {
		const options = [
			{ label: "A", fieldPct: 50 },
			{ label: "B", fieldPct: 50 },
		]
		expect(leadingOption(options)?.label).toBe("A")
	})
})

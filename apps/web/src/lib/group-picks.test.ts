import { describe, expect, it } from "vitest"
import { groupPicksLine } from "./group-picks"

const OVER_UNDER = [
	{ id: "over", label: "Over", sortOrder: 0 },
	{ id: "under", label: "Under", sortOrder: 1 },
]

const tally = (optionId: string, count: number, name: string) => ({
	optionId,
	count,
	sampleUser: { name },
})

describe("groupPicksLine", () => {
	it("names the one group-mate who picked", () => {
		expect(groupPicksLine([tally("over", 1, "Sam")], OVER_UNDER)?.text).toBe(
			"Sam picked Over",
		)
	})

	it("leads with the side most of them took and adds the other", () => {
		const line = groupPicksLine(
			[tally("under", 1, "Ali"), tally("over", 3, "Sam")],
			OVER_UNDER,
		)
		expect(line?.text).toBe("Sam and 2 others picked Over, 1 picked Under")
		expect(line?.sampleUser.name).toBe("Sam")
	})

	it("says 1 other, not 1 others", () => {
		expect(groupPicksLine([tally("over", 2, "Sam")], OVER_UNDER)?.text).toBe(
			"Sam and 1 other picked Over",
		)
	})

	it("breaks an even split by the options' order", () => {
		expect(
			groupPicksLine(
				[tally("under", 2, "Ali"), tally("over", 2, "Sam")],
				OVER_UNDER,
			)?.text,
		).toBe("Sam and 1 other picked Over, 2 picked Under")
	})

	it("names only the top option in a pool", () => {
		const pool = [
			{ id: "a", label: "Nikola Jokic", sortOrder: 0 },
			{ id: "b", label: "Jamal Murray", sortOrder: 1 },
			{ id: "c", label: "Aaron Gordon", sortOrder: 2 },
		]
		expect(
			groupPicksLine([tally("a", 2, "Sam"), tally("b", 1, "Ali")], pool)?.text,
		).toBe("Sam and 1 other picked Nikola Jokic")
	})

	it("is null with nobody to name", () => {
		expect(groupPicksLine([], OVER_UNDER)).toBeNull()
	})
})

import { describe, expect, it } from "vitest"
import { picksVersion } from "./ballot-entry"

describe("picksVersion", () => {
	const members = [
		{ call: { guessValue: 52 }, tiebreakPosition: null },
		{ call: { guessValue: 48 }, tiebreakPosition: 1 },
		{ call: null, tiebreakPosition: null },
	]

	it("is stable for the same picks", () => {
		expect(picksVersion(members)).toBe(picksVersion([...members]))
	})

	it("changes when a pick's number changes", () => {
		const rebalanced = [
			{ call: { guessValue: 51 }, tiebreakPosition: null },
			...members.slice(1),
		]
		expect(picksVersion(rebalanced)).not.toBe(picksVersion(members))
	})

	it("changes when a tie is reordered", () => {
		const reordered = [
			members[0],
			{ call: { guessValue: 48 }, tiebreakPosition: 2 },
			members[2],
		]
		expect(picksVersion(reordered)).not.toBe(picksVersion(members))
	})

	it("hashes no picks to zero", () => {
		expect(picksVersion([])).toBe("0")
	})
})

import { describe, expect, it } from "vitest"
import { formatTeamRecord } from "./game-status"

describe("formatTeamRecord", () => {
	it("writes a tie only once there is one", () => {
		expect(
			formatTeamRecord({ wins: 10, losses: 6, ties: 0, otLosses: null }),
		).toBe("10-6")
		expect(
			formatTeamRecord({ wins: 10, losses: 6, ties: 1, otLosses: null }),
		).toBe("10-6-1")
	})

	it("always writes the NHL's overtime losses, zero included", () => {
		expect(
			formatTeamRecord({ wins: 48, losses: 20, ties: 0, otLosses: 12 }),
		).toBe("48-20-12")
		expect(formatTeamRecord({ wins: 1, losses: 0, ties: 0, otLosses: 0 })).toBe(
			"1-0-0",
		)
	})

	it("has nothing to show without a record", () => {
		expect(formatTeamRecord(null)).toBeNull()
	})
})

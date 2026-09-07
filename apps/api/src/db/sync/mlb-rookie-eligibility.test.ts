import { describe, expect, it } from "vitest"
import {
	isUnderRookieThresholds,
	priorSeasonWorkload,
} from "./mlb-rookie-eligibility"
import type { MlbStatGroup } from "./mlb-stats-client"

function hitting(splits: [string, number][]): MlbStatGroup {
	return {
		group: { displayName: "hitting" },
		splits: splits.map(([season, atBats]) => ({ season, stat: { atBats } })),
	}
}

function pitching(splits: [string, string, number][]): MlbStatGroup {
	return {
		group: { displayName: "pitching" },
		splits: splits.map(([season, inningsPitched, atBats]) => ({
			season,
			stat: { inningsPitched, atBats },
		})),
	}
}

describe("priorSeasonWorkload", () => {
	it("ignores the season being decided and everything after it", () => {
		const stats = [
			hitting([
				["2025", 55],
				["2026", 549],
			]),
		]
		expect(priorSeasonWorkload(stats, 2026)).toEqual({
			atBats: 55,
			inningsPitchedOuts: 0,
		})
	})

	it("does not charge a pitcher for the at-bats taken against him", () => {
		// Parker Messick's real 2025 line: 39.2 innings, 159 at-bats faced.
		// Counting those as his own would push a rookie-eligible starter past
		// the 130-at-bat hitters' threshold.
		const stats = [pitching([["2025", "39.2", 159]])]
		expect(priorSeasonWorkload(stats, 2026)).toEqual({
			atBats: 0,
			inningsPitchedOuts: 119,
		})
	})

	it("reads the fraction as thirds of an inning, not a decimal", () => {
		expect(
			priorSeasonWorkload([pitching([["2025", "12.1", 0]])], 2026),
		).toHaveProperty("inningsPitchedOuts", 37)
		expect(
			priorSeasonWorkload([pitching([["2025", "12.2", 0]])], 2026),
		).toHaveProperty("inningsPitchedOuts", 38)
	})

	it("charges a two-way player for both halves of his career", () => {
		const stats = [
			hitting([
				["2024", 40],
				["2025", 60],
			]),
			pitching([
				["2024", "10.0", 44],
				["2025", "20.0", 88],
			]),
		]
		expect(priorSeasonWorkload(stats, 2026)).toEqual({
			atBats: 100,
			inningsPitchedOuts: 90,
		})
	})

	it("treats a player with no MLB stat line at all as having done nothing", () => {
		expect(priorSeasonWorkload(undefined, 2026)).toEqual({
			atBats: 0,
			inningsPitchedOuts: 0,
		})
	})
})

describe("isUnderRookieThresholds", () => {
	it("keeps a September call-up eligible the following season", () => {
		// Payton Tolle's real 2025: 16.1 innings. ESPN reads this as two years
		// of experience, which is exactly why experience alone can't decide it.
		expect(isUnderRookieThresholds({ atBats: 0, inningsPitchedOuts: 49 })).toBe(
			true,
		)
		expect(isUnderRookieThresholds({ atBats: 55, inningsPitchedOuts: 0 })).toBe(
			true,
		)
	})

	it("is exclusive at both thresholds - the rule is 'more than'", () => {
		expect(
			isUnderRookieThresholds({ atBats: 129, inningsPitchedOuts: 149 }),
		).toBe(true)
		expect(
			isUnderRookieThresholds({ atBats: 130, inningsPitchedOuts: 0 }),
		).toBe(false)
		expect(
			isUnderRookieThresholds({ atBats: 0, inningsPitchedOuts: 150 }),
		).toBe(false)
	})

	it("disqualifies on either threshold independently", () => {
		expect(
			isUnderRookieThresholds({ atBats: 400, inningsPitchedOuts: 0 }),
		).toBe(false)
		expect(
			isUnderRookieThresholds({ atBats: 0, inningsPitchedOuts: 300 }),
		).toBe(false)
	})
})

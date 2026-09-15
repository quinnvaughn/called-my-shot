import { describe, expect, it } from "vitest"
import type { StatToleranceTier } from "../db/schema"
import { numericToleranceFor } from "./numeric-tolerance"

function tier(
	toleranceMode: StatToleranceTier["toleranceMode"],
	toleranceValue: number,
): StatToleranceTier {
	return {
		id: `${toleranceMode}-${toleranceValue}`,
		name: `${toleranceMode} ${toleranceValue}`,
		toleranceMode,
		toleranceValue,
	}
}

describe("numericToleranceFor", () => {
	const main = tier("percentage", 0.1)
	const team = tier("absolute", 6)

	it("gives a team question the stat's team band", () => {
		expect(
			numericToleranceFor("team_stat_numeric_guess", {
				toleranceTier: main,
				teamToleranceTier: team,
			}),
		).toEqual({ numericTolerancePct: null, numericToleranceAbsolute: 6 })
	})

	it("gives a player question the main band even when a team band exists", () => {
		expect(
			numericToleranceFor("player_stat_numeric_guess", {
				toleranceTier: main,
				teamToleranceTier: team,
			}),
		).toEqual({ numericTolerancePct: 0.1, numericToleranceAbsolute: null })
	})

	it("falls back to the main band for a team question with no team band", () => {
		expect(
			numericToleranceFor("team_season_stat_numeric_guess", {
				toleranceTier: main,
				teamToleranceTier: null,
			}),
		).toEqual({ numericTolerancePct: 0.1, numericToleranceAbsolute: null })
	})

	it("gives a game team question its league's saved band first", () => {
		expect(
			numericToleranceFor(
				"team_stat_numeric_guess",
				{ toleranceTier: main, teamToleranceTier: team },
				4,
			),
		).toEqual({ numericTolerancePct: null, numericToleranceAbsolute: 4 })
	})

	it("ignores a saved band on a season-long team question", () => {
		expect(
			numericToleranceFor(
				"team_season_stat_numeric_guess",
				{ toleranceTier: main, teamToleranceTier: team },
				4,
			),
		).toEqual({ numericTolerancePct: null, numericToleranceAbsolute: 6 })
	})

	it("returns null when the stat was loaded without its band", () => {
		expect(
			numericToleranceFor("team_stat_numeric_guess", {
				toleranceTier: null,
				teamToleranceTier: null,
			}),
		).toBeNull()
	})
})

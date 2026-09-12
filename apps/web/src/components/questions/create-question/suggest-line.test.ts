import { describe, expect, it } from "vitest"
import { suggestLine } from "./suggest-line"

const points = { typicalPlayerLine: 24.5, typicalTeamLine: 112.5 }

describe("suggestLine", () => {
	it("reads the player line for a player shape", () => {
		expect(
			suggestLine({
				shape: "player_stat_over_under",
				stat: points,
				statAggregation: undefined,
			}),
		).toBe(24.5)
	})

	it("reads the team line for a team shape", () => {
		expect(
			suggestLine({
				shape: "team_stat_over_under",
				stat: points,
				statAggregation: undefined,
			}),
		).toBe(112.5)
	})

	it("doubles the team line for a game total, landing on a half point", () => {
		// Both teams combined - and 112.5 x 2 is 225, a whole number the line is
		// never allowed to be, so it snaps off it.
		expect(
			suggestLine({
				shape: "game_total_over_under",
				stat: points,
				statAggregation: undefined,
			}),
		).toBe(225.5)
	})

	it("suggests the same per-game line for a season per-game reading", () => {
		expect(
			suggestLine({
				shape: "player_season_stat_over_under",
				stat: points,
				statAggregation: "per_game",
			}),
		).toBe(24.5)
	})

	it("suggests nothing for a season total", () => {
		// A season total is the per-game figure times a season's worth of games,
		// which nothing here knows - better to ask than to be ~82x low.
		expect(
			suggestLine({
				shape: "player_season_stat_over_under",
				stat: points,
				statAggregation: "total",
			}),
		).toBeUndefined()
	})

	it("suggests nothing when the stat carries no typical line", () => {
		expect(
			suggestLine({
				shape: "team_season_stat_over_under",
				stat: { typicalPlayerLine: null, typicalTeamLine: null },
				statAggregation: "per_game",
			}),
		).toBeUndefined()
	})

	it("suggests nothing when no stat is picked yet", () => {
		expect(
			suggestLine({
				shape: "player_stat_over_under",
				stat: undefined,
				statAggregation: undefined,
			}),
		).toBeUndefined()
	})

	it("suggests nothing for a player shape on a team-only stat", () => {
		expect(
			suggestLine({
				shape: "player_stat_over_under",
				stat: { typicalPlayerLine: null, typicalTeamLine: 41.5 },
				statAggregation: undefined,
			}),
		).toBeUndefined()
	})
})

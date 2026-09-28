import { describe, expect, it } from "vitest"
import {
	autoResolutionSource,
	autoResolveStatKeyFor,
	championshipKeyFor,
	resolutionModeFor,
} from "./auto-resolve"

describe("resolutionModeFor", () => {
	it("settles a catalog stat ESPN reports for that league and scope", () => {
		expect(
			resolutionModeFor({
				shape: "player_stat_over_under",
				leagueSlug: "nba",
				statName: "Points",
			}),
		).toBe("system")
		expect(
			autoResolveStatKeyFor({
				shape: "game_total_over_under",
				leagueSlug: "nfl",
				statName: "Points",
			}),
		).toBe("nfl:game:team:Points")
	})

	it("leaves a custom stat, an unknown stat or an unmapped league to a person", () => {
		expect(
			resolutionModeFor({
				shape: "player_stat_over_under",
				leagueSlug: "nba",
				statName: null,
				customStat: "Deflections",
			}),
		).toBe("manual")
		expect(
			resolutionModeFor({
				shape: "team_stat_over_under",
				leagueSlug: "nba",
				statName: "Wins",
			}),
		).toBe("manual")
		expect(
			resolutionModeFor({
				shape: "player_stat_over_under",
				leagueSlug: "nhl",
				statName: "Points",
			}),
		).toBe("manual")
	})

	it("only settles a game leader from a stat that can have one", () => {
		expect(
			resolutionModeFor({
				shape: "player_game_stat_leader",
				leagueSlug: "mlb",
				statName: "Hits",
			}),
		).toBe("system")
		expect(
			resolutionModeFor({
				shape: "player_game_stat_leader",
				leagueSlug: "mlb",
				statName: "Batting Average",
			}),
		).toBe("manual")
	})

	it("settles team_vs_team off the score and never a yes/no prop", () => {
		expect(
			resolutionModeFor({
				shape: "team_vs_team",
				leagueSlug: "nba",
				statName: null,
			}),
		).toBe("system")
		expect(
			resolutionModeFor({
				shape: "yes_no_prop",
				leagueSlug: "nba",
				statName: null,
			}),
		).toBe("manual")
	})
})

describe("resolutionModeFor - season questions", () => {
	it("settles season lines and win totals from ESPN's season numbers", () => {
		expect(
			autoResolveStatKeyFor({
				shape: "player_season_stat_over_under",
				leagueSlug: "nba",
				statName: "Points",
				statAggregation: "per_game",
			}),
		).toBe("nba:season:player:Points")
		expect(
			autoResolveStatKeyFor({
				shape: "team_season_stat_numeric_guess",
				leagueSlug: "mlb",
				statName: "Wins",
				statAggregation: "total",
			}),
		).toBe("mlb:season:team:Wins")
		expect(
			autoResolveStatKeyFor({
				shape: "team_vs_team_season",
				leagueSlug: "nfl",
				statName: "Wins",
			}),
		).toBe("nfl:season:team:Wins")
	})

	it("only settles a season leader from a season total of a counting stat", () => {
		const leader = (
			statName: string,
			statAggregation?: "total" | "per_game" | null,
		) =>
			resolutionModeFor({
				shape: "player_season_stat_leader",
				leagueSlug: "mlb",
				statName,
				statAggregation,
			})
		expect(leader("Home Runs", "total")).toBe("system")
		expect(leader("Home Runs", null)).toBe("system")
		expect(leader("Home Runs", "per_game")).toBe("manual")
		expect(leader("Batting Average", "total")).toBe("manual")
	})

	it("leaves awards to a person", () => {
		expect(
			resolutionModeFor({
				shape: "player_season_award",
				leagueSlug: "nba",
				statName: null,
			}),
		).toBe("manual")
	})
})

describe("resolutionModeFor - championships", () => {
	const pennant = {
		shape: "team_season_award",
		leagueSlug: "mlb",
		statName: null,
		awardName: "Pennant",
		awardVerb: "win",
		picksRequired: 1,
		awardConferences: ["AL"],
	} as const

	it("settles a league or conference title from the postseason", () => {
		expect(resolutionModeFor({ ...pennant })).toBe("system")
		expect(
			resolutionModeFor({
				...pennant,
				leagueSlug: "nba",
				awardName: "NBA Finals",
				awardConferences: [],
			}),
		).toBe("system")
		expect(
			championshipKeyFor({
				leagueSlug: "nfl",
				awardName: "Championship",
				awardVerb: "win",
				picksRequired: 1,
				awardConferences: ["NFC"],
			}),
		).toBe("nfl:Championship:NFC")
	})

	it("leaves any other team award to a person", () => {
		expect(resolutionModeFor({ ...pennant, awardName: "Best Record" })).toBe(
			"manual",
		)
		expect(resolutionModeFor({ ...pennant, picksRequired: 2 })).toBe("manual")
		expect(
			resolutionModeFor({ ...pennant, awardConferences: ["AL", "NL"] }),
		).toBe("manual")
		expect(resolutionModeFor({ ...pennant, awardDivisions: ["AL East"] })).toBe(
			"manual",
		)
	})
})

describe("autoResolutionSource", () => {
	it("names the ESPN numbers each kind of question settles from", () => {
		expect(autoResolutionSource("game")).toBe("ESPN box score")
		expect(autoResolutionSource("season")).toBe("ESPN regular-season stats")
		expect(autoResolutionSource("postseason")).toBe("ESPN postseason results")
	})
})

describe("resolutionModeFor - team season leader", () => {
	it("settles off the game stat its box scores add up", () => {
		expect(
			autoResolveStatKeyFor({
				shape: "player_team_season_stat_leader",
				leagueSlug: "nba",
				statName: "Minutes",
			}),
		).toBe("nba:game:player:Minutes")
		expect(
			resolutionModeFor({
				shape: "player_team_season_stat_leader",
				leagueSlug: "nfl",
				statName: "Receiving Yards",
			}),
		).toBe("system")
	})

	it("leaves a stat with no stored box-score cell, a rate or a custom stat to a person", () => {
		for (const statName of ["Saves", "Batting Average"]) {
			expect(
				resolutionModeFor({
					shape: "player_team_season_stat_leader",
					leagueSlug: "mlb",
					statName,
				}),
			).toBe("manual")
		}
		expect(
			resolutionModeFor({
				shape: "player_team_season_stat_leader",
				leagueSlug: "nba",
				statName: null,
				customStat: "Deflections",
			}),
		).toBe("manual")
	})
})

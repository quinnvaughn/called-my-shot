import { describe, expect, it } from "vitest"
import type {
	EspnSeasonStatistics,
	EspnStandingsGroup,
} from "../../db/sync/espn-client"
import {
	flattenCategorizedStatistics,
	parseStandingsWins,
} from "../../db/sync/season-stats-parse"
import { espnFixture } from "../../test/helpers"
import { SEASON_EXTRACTORS, type SeasonSources } from "./registry"
import {
	decideSeasonQuestion,
	decideTeamSeasonLeader,
	type SeasonQuestionContext,
} from "./season-decide"

// See season-stats-parse.test.ts for where the fixtures come from.
const fixture = <T>(name: string) => espnFixture<T>(`${name}.json`)

const seasonStats = (name: string) =>
	flattenCategorizedStatistics(fixture<EspnSeasonStatistics>(name))
const standingsWins = (league: "nba" | "nfl") =>
	parseStandingsWins(fixture<EspnStandingsGroup>(`standings-${league}`))

// NBA athlete 4869780: 948 points in 81 games. MLB athlete 41197: .296. NFL
// team 25: 20 sacks. NHL skater 3895074: 138 points in 82 games; goalie
// 4196914: .899 on 1372 shots.
const sources = (overrides: Partial<SeasonSources> = {}): SeasonSources => ({
	athleteStats: new Map([
		["4869780", seasonStats("season-athlete-nba-4869780")],
		["41197", seasonStats("season-athlete-mlb-41197")],
		["3895074", seasonStats("season-athlete-nhl-3895074")],
		["4196914", seasonStats("season-athlete-nhl-4196914")],
		["never-played", new Map()],
	]),
	teamStats: new Map([["25", seasonStats("season-team-nfl-25")]]),
	winsByTeam: new Map(),
	...overrides,
})

const OVER = { id: "over", sortOrder: 0, playerId: null, teamId: null }
const UNDER = { id: "under", sortOrder: 1, playerId: null, teamId: null }

function context(
	overrides: Partial<SeasonQuestionContext>,
): SeasonQuestionContext {
	return {
		question: {
			shape: "player_season_stat_over_under",
			ouLine: null,
			subjectPlayerId: "player",
			subjectTeamId: null,
			statAggregation: "total",
		},
		options: [OVER, UNDER],
		extractor: SEASON_EXTRACTORS["nba:season:player:Points"],
		sources: sources(),
		espnAthleteIdByPlayerId: new Map(),
		espnTeamIdByTeamId: new Map(),
		...overrides,
	}
}

const playerLine = (
	espnAthleteId: string,
	ouLine: number,
	statAggregation: "total" | "per_game" = "total",
) =>
	context({
		question: {
			shape: "player_season_stat_over_under",
			ouLine,
			subjectPlayerId: "player",
			subjectTeamId: null,
			statAggregation,
		},
		espnAthleteIdByPlayerId: new Map([["player", espnAthleteId]]),
	})

const teamQuestion = (
	shape: SeasonQuestionContext["question"]["shape"],
	ouLine: number | null = null,
) => ({
	shape,
	ouLine,
	subjectPlayerId: null,
	subjectTeamId: "team",
	statAggregation: "total" as const,
})

describe("decideSeasonQuestion - player lines", () => {
	it("grades a season total", () => {
		expect(decideSeasonQuestion(playerLine("4869780", 900.5))).toEqual({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 948,
			evidence: { value: 948 },
		})
	})

	it("reads season minutes as a total or a per-game rate", () => {
		// 2023 minutes in 81 games.
		const minutes = SEASON_EXTRACTORS["nba:season:player:Minutes"]
		expect(
			decideSeasonQuestion({
				...playerLine("4869780", 2000.5),
				extractor: minutes,
			}),
		).toMatchObject({ kind: "resolve", actualValue: 2023 })
		expect(
			decideSeasonQuestion({
				...playerLine("4869780", 24.5, "per_game"),
				extractor: minutes,
			}),
		).toMatchObject({ kind: "resolve", actualValue: 24.975 })
	})

	it("works a per-game line out from the total", () => {
		// 948 / 81 = 11.7037...
		expect(
			decideSeasonQuestion(playerLine("4869780", 11.5, "per_game")),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 11.704,
			evidence: { value: 11.704 },
		})
	})

	it("reads a rate stat as ESPN has it", () => {
		expect(
			decideSeasonQuestion({
				...playerLine("41197", 0.3),
				extractor: SEASON_EXTRACTORS["mlb:season:player:Batting Average"],
			}),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["under"],
			actualValue: 0.296,
			evidence: { value: 0.296 },
		})
	})

	it("divides an NHL per-game line by ESPN's games", () => {
		// 138 / 82 = 1.6829...
		expect(
			decideSeasonQuestion({
				...playerLine("3895074", 1.5, "per_game"),
				extractor: SEASON_EXTRACTORS["nhl:season:player:Points"],
			}),
		).toMatchObject({ kind: "resolve", actualValue: 1.683 })
	})

	it("reads a goalie's save percentage, and leaves a skater's undefined", () => {
		const savePct = SEASON_EXTRACTORS["nhl:season:player:Save Percentage"]
		expect(
			decideSeasonQuestion({
				...playerLine("4196914", 0.905),
				extractor: savePct,
			}),
		).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["under"],
			actualValue: 0.899,
		})
		expect(
			decideSeasonQuestion({
				...playerLine("3895074", 0.905),
				extractor: savePct,
			}),
		).toMatchObject({ kind: "fail", reason: "stat_undefined" })
	})

	it("voids the question for a player ESPN has no season for", () => {
		expect(decideSeasonQuestion(playerLine("never-played", 0.5))).toEqual({
			kind: "void",
			reason: "subject_did_not_play",
		})
	})

	it("voids a pitching line for a player who never pitched", () => {
		expect(
			decideSeasonQuestion({
				...playerLine("41197", 10.5),
				extractor: SEASON_EXTRACTORS["mlb:season:player:Strikeouts (Pitching)"],
			}),
		).toEqual({ kind: "void", reason: "subject_did_not_play" })
	})

	it("retries a player whose statistics couldn't be fetched", () => {
		expect(decideSeasonQuestion(playerLine("unfetched", 0.5))).toMatchObject({
			kind: "fail",
			reason: "fetch_failed",
			retryable: true,
		})
	})
})

describe("decideSeasonQuestion - teams", () => {
	it("reads a win total from the standings", () => {
		expect(
			decideSeasonQuestion(
				context({
					question: teamQuestion("team_season_stat_numeric_guess"),
					options: [],
					extractor: SEASON_EXTRACTORS["nba:season:team:Wins"],
					sources: sources({ winsByTeam: standingsWins("nba") }),
					espnTeamIdByTeamId: new Map([["team", "3"]]),
				}),
			),
		).toMatchObject({ kind: "resolve", actualValue: 26 })
	})

	it("retries when the standings couldn't be read", () => {
		expect(
			decideSeasonQuestion(
				context({
					question: teamQuestion("team_season_stat_numeric_guess"),
					options: [],
					extractor: SEASON_EXTRACTORS["nba:season:team:Wins"],
					sources: sources({ winsByTeam: null }),
					espnTeamIdByTeamId: new Map([["team", "3"]]),
				}),
			),
		).toMatchObject({ kind: "fail", reason: "fetch_failed", retryable: true })
	})

	it("reads an NFL team's sacks as its defense's", () => {
		expect(
			decideSeasonQuestion(
				context({
					question: teamQuestion("team_season_stat_over_under", 19.5),
					extractor: SEASON_EXTRACTORS["nfl:season:team:Sacks"],
					espnTeamIdByTeamId: new Map([["team", "25"]]),
				}),
			),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 20,
			evidence: { value: 20 },
		})
	})

	it("gives a team head-to-head to the team with more wins", () => {
		// NFL team 25 won 12, team 17 won 14.
		expect(
			decideSeasonQuestion(
				context({
					question: teamQuestion("team_vs_team_season"),
					options: [
						{ id: "a", sortOrder: 0, playerId: null, teamId: "ta" },
						{ id: "b", sortOrder: 1, playerId: null, teamId: "tb" },
					],
					extractor: SEASON_EXTRACTORS["nfl:season:team:Wins"],
					sources: sources({ winsByTeam: standingsWins("nfl") }),
					espnTeamIdByTeamId: new Map([
						["ta", "25"],
						["tb", "17"],
					]),
				}),
			),
		).toMatchObject({ kind: "resolve", correctOptionIds: ["b"] })
	})
})

describe("decideSeasonQuestion - pool leader", () => {
	const leaderContext = (rivalPoints: number) =>
		context({
			question: {
				shape: "player_season_stat_leader",
				ouLine: null,
				subjectPlayerId: null,
				subjectTeamId: null,
				statAggregation: null,
			},
			options: ["pa", "pb", "pc"].map((playerId, i) => ({
				id: `option-${playerId}`,
				sortOrder: i,
				playerId,
				teamId: null,
			})),
			sources: sources({
				athleteStats: new Map([
					["4869780", seasonStats("season-athlete-nba-4869780")],
					[
						"rival",
						new Map([
							["offensive.points", rivalPoints],
							["general.gamesPlayed", 70],
						]),
					],
					["never-played", new Map()],
				]),
			}),
			espnAthleteIdByPlayerId: new Map([
				["pa", "4869780"],
				["pb", "rival"],
				["pc", "never-played"],
			]),
		})

	it("marks the pool player with the most, counting one who never played as none", () => {
		expect(decideSeasonQuestion(leaderContext(500))).toEqual({
			kind: "resolve",
			correctOptionIds: ["option-pa"],
			optionValues: [
				{ optionId: "option-pa", value: 948 },
				{ optionId: "option-pb", value: 500 },
				{ optionId: "option-pc", value: 0 },
			],
			evidence: { max: 948 },
		})
	})

	it("marks every pool player tied for the most", () => {
		expect(decideSeasonQuestion(leaderContext(948))).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["option-pa", "option-pb"],
		})
	})
})

describe("decideTeamSeasonLeader", () => {
	const options = [
		{ id: "opt-a", playerId: "a" },
		{ id: "opt-b", playerId: "b" },
		{ id: "opt-c", playerId: "c" },
	]
	const total = (playerId: string | null, value: number) => ({
		sourceAthleteId: `nba:${playerId ?? "unlinked"}`,
		playerId,
		value,
	})

	it("marks the pool player with the most correct, and carries every option's total", () => {
		const decision = decideTeamSeasonLeader({
			options,
			totals: [total("a", 2400), total("b", 2650), total("c", 900)],
			gamesMissingBoxScores: 0,
		})
		expect(decision).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["opt-b"],
			optionValues: [
				{ optionId: "opt-a", value: 2400 },
				{ optionId: "opt-b", value: 2650 },
				{ optionId: "opt-c", value: 900 },
			],
		})
	})

	it("reads a pool player with no games for the team as zero", () => {
		const decision = decideTeamSeasonLeader({
			options,
			totals: [total("a", 2400)],
			gamesMissingBoxScores: 0,
		})
		expect(decision).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["opt-a"],
			optionValues: expect.arrayContaining([{ optionId: "opt-c", value: 0 }]),
		})
	})

	it("marks every pool player tied for the most correct", () => {
		const decision = decideTeamSeasonLeader({
			options,
			totals: [total("a", 2400), total("b", 2400)],
			gamesMissingBoxScores: 0,
		})
		expect(decision).toMatchObject({ correctOptionIds: ["opt-a", "opt-b"] })
	})

	it("fails when someone outside the pool led the team", () => {
		const decision = decideTeamSeasonLeader({
			options,
			totals: [total("a", 2400), total("traded-in", 2500), total(null, 100)],
			gamesMissingBoxScores: 0,
		})
		expect(decision).toMatchObject({
			kind: "fail",
			reason: "leader_not_in_pool",
		})
	})

	it("waits while any of the team's games has no stored box score", () => {
		const decision = decideTeamSeasonLeader({
			options,
			totals: [total("a", 2400)],
			gamesMissingBoxScores: 2,
		})
		expect(decision).toMatchObject({
			kind: "fail",
			reason: "fetch_failed",
			retryable: true,
		})
	})

	it("voids when nobody on the team recorded the stat", () => {
		expect(
			decideTeamSeasonLeader({ options, totals: [], gamesMissingBoxScores: 0 }),
		).toEqual({ kind: "void", reason: "no_leader" })
	})
})

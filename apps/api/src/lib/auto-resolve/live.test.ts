import { describe, expect, it } from "vitest"
import { parseBoxScore } from "../../db/sync/box-score-parse"
import type { EspnGameSummary } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import {
	decidedEarly,
	type LiveQuestionContext,
	readLiveGameQuestion,
} from "./live"
import { GAME_EXTRACTORS } from "./registry"

const nbaBox = () =>
	parseBoxScore(espnFixture<EspnGameSummary>("nba-summary.json"))

function context(
	overrides: Partial<LiveQuestionContext>,
): LiveQuestionContext {
	return {
		question: {
			shape: "player_stat_over_under",
			ouLine: null,
			subjectPlayerId: "player",
			subjectTeamId: null,
		},
		options: [],
		extractor: GAME_EXTRACTORS["nba:game:player:Points"],
		sources: {
			box: nbaBox(),
			didNotPlayByTeam: new Map(),
			athleteGameStats: new Map(),
		},
		espnAthleteIdByPlayerId: new Map(),
		playerIdByEspnAthleteId: new Map(),
		espnTeamIdByTeamId: new Map([
			["home", "2"],
			["away", "3"],
		]),
		homeTeamId: "home",
		awayTeamId: "away",
		...overrides,
	}
}

const twoPlayers = (
	shape: "player_vs_player" | "player_game_stat_leader",
): Pick<LiveQuestionContext, "question" | "options"> => ({
	question: { shape, ouLine: null, subjectPlayerId: null, subjectTeamId: null },
	options: [
		{ id: "a", sortOrder: 0, playerId: "pa", teamId: null },
		{ id: "b", sortOrder: 1, playerId: "pb", teamId: null },
	],
})

describe("readLiveGameQuestion", () => {
	it("reads a player's stat so far", () => {
		// 4869780 has 25.
		expect(
			readLiveGameQuestion(
				context({
					espnAthleteIdByPlayerId: new Map([["player", "4869780"]]),
				}),
			),
		).toEqual({ value: 25, optionValues: null })
	})

	// Settling would void on this. Mid-game it's just nothing to show yet.
	it("has nothing to show for a player without a line", () => {
		expect(
			readLiveGameQuestion(
				context({ espnAthleteIdByPlayerId: new Map([["player", "3442"]]) }),
			),
		).toBeNull()
	})

	// A tie would void as a push once final. Live, it's just level.
	it("reads both sides of a head-to-head, level or not", () => {
		// 3155535 and 4065804 both have 6 rebounds.
		expect(
			readLiveGameQuestion(
				context({
					...twoPlayers("player_vs_player"),
					extractor: GAME_EXTRACTORS["nba:game:player:Rebounds"],
					espnAthleteIdByPlayerId: new Map([
						["pa", "3155535"],
						["pb", "4065804"],
					]),
				}),
			),
		).toEqual({
			value: null,
			optionValues: [
				{ optionId: "a", value: 6 },
				{ optionId: "b", value: 6 },
			],
		})
	})

	it("reads a leader pool, counting anyone without the stat as zero", () => {
		// 4869780 has 25 points; 3442 sat.
		expect(
			readLiveGameQuestion(
				context({
					...twoPlayers("player_game_stat_leader"),
					espnAthleteIdByPlayerId: new Map([
						["pa", "4869780"],
						["pb", "3442"],
					]),
				}),
			),
		).toEqual({
			value: null,
			optionValues: [
				{ optionId: "a", value: 25 },
				{ optionId: "b", value: 0 },
			],
		})
	})

	it("adds both teams up for a game total", () => {
		// 144-118.
		expect(
			readLiveGameQuestion(
				context({
					question: {
						shape: "game_total_over_under",
						ouLine: null,
						subjectPlayerId: null,
						subjectTeamId: null,
					},
					extractor: GAME_EXTRACTORS["nba:game:team:Points"],
				}),
			),
		).toEqual({ value: 262, optionValues: null })
	})

	it("reads the score for who wins, without a stat", () => {
		expect(
			readLiveGameQuestion(
				context({
					question: {
						shape: "team_vs_team",
						ouLine: null,
						subjectPlayerId: null,
						subjectTeamId: null,
					},
					options: [
						{ id: "h", sortOrder: 0, playerId: null, teamId: "home" },
						{ id: "a", sortOrder: 1, playerId: null, teamId: "away" },
					],
					extractor: null,
				}),
			),
		).toEqual({
			value: null,
			optionValues: [
				{ optionId: "h", value: 144 },
				{ optionId: "a", value: 118 },
			],
		})
	})

	it("has nothing to show for a shape the box score can't speak to", () => {
		expect(
			readLiveGameQuestion(
				context({
					question: {
						shape: "yes_no_prop",
						ouLine: null,
						subjectPlayerId: null,
						subjectTeamId: null,
					},
				}),
			),
		).toBeNull()
	})
})

describe("decidedEarly: an Over already past its line", () => {
	const overUnder = (ouLine: number): Partial<LiveQuestionContext> => ({
		question: {
			shape: "player_stat_over_under",
			ouLine,
			subjectPlayerId: "player",
			subjectTeamId: null,
		},
		options: [
			{ id: "over", sortOrder: 0, playerId: null, teamId: null },
			{ id: "under", sortOrder: 1, playerId: null, teamId: null },
		],
		// 4869780 has 25.
		espnAthleteIdByPlayerId: new Map([["player", "4869780"]]),
	})

	it("settles an Over already past its line", () => {
		expect(decidedEarly(context(overUnder(22.5)))).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 25,
		})
	})

	it("leaves an Over that hasn't cleared its line", () => {
		expect(decidedEarly(context(overUnder(25.5)))).toBeNull()
		expect(decidedEarly(context(overUnder(25)))).toBeNull()
	})

	it("leaves a stat that can still drop", () => {
		const { onlyRises: _, ...canDrop } =
			GAME_EXTRACTORS["nba:game:player:Points"]
		expect(
			decidedEarly(context({ ...overUnder(22.5), extractor: canDrop })),
		).toBeNull()
	})

	it("adds both teams up for a game total", () => {
		// 144-118.
		expect(
			decidedEarly(
				context({
					...overUnder(250.5),
					question: {
						shape: "game_total_over_under",
						ouLine: 250.5,
						subjectPlayerId: null,
						subjectTeamId: null,
					},
					extractor: GAME_EXTRACTORS["nba:game:team:Points"],
				}),
			),
		).toMatchObject({ correctOptionIds: ["over"], actualValue: 262 })
	})

	it("leaves a comparison to the rest of the game", () => {
		expect(
			decidedEarly(
				context({
					...twoPlayers("player_vs_player"),
					espnAthleteIdByPlayerId: new Map([
						["pa", "4869780"],
						["pb", "3155535"],
					]),
				}),
			),
		).toBeNull()
	})
})

describe("decidedEarly: every player out of the game", () => {
	// The MLB fixture as if still being played, with `pulled` taken out of the
	// game in that table's role and everyone else still in.
	const mlbSources = (pulled: { pitching?: string[]; batting?: string[] }) => {
		const summary = espnFixture<EspnGameSummary>("mlb-summary.json")
		for (const team of summary.boxscore?.players ?? []) {
			for (const table of team.statistics) {
				const out =
					table.type === "pitching" || table.type === "batting"
						? (pulled[table.type] ?? [])
						: []
				for (const entry of table.athletes) {
					entry.active = !out.includes(entry.athlete.id)
				}
			}
		}
		return {
			box: parseBoxScore(summary),
			didNotPlayByTeam: new Map(),
			athleteGameStats: new Map(),
		}
	}

	const OVER_UNDER = [
		{ id: "over", sortOrder: 0, playerId: null, teamId: null },
		{ id: "under", sortOrder: 1, playerId: null, teamId: null },
	]
	// 4019484 threw 83 pitches with 4 earned runs; 32685 threw 80.
	const pitcher = {
		espnAthleteIdByPlayerId: new Map([
			["player", "4019484"],
			["pa", "4019484"],
			["pb", "32685"],
		]),
	}
	const pitchCount = (
		shape: "player_stat_over_under" | "player_stat_numeric_guess",
		ouLine: number | null,
	): Partial<LiveQuestionContext> => ({
		...pitcher,
		question: {
			shape,
			ouLine,
			subjectPlayerId: "player",
			subjectTeamId: null,
		},
		options: shape === "player_stat_over_under" ? OVER_UNDER : [],
		extractor: GAME_EXTRACTORS["mlb:game:player:Pitches Thrown"],
	})

	it("settles an Under once the pitcher is pulled", () => {
		expect(
			decidedEarly(
				context({
					...pitchCount("player_stat_over_under", 93.5),
					sources: mlbSources({ pitching: ["4019484"] }),
				}),
			),
		).toMatchObject({ correctOptionIds: ["under"], actualValue: 83 })
	})

	it("leaves an Under while the pitcher is still in", () => {
		expect(
			decidedEarly(
				context({
					...pitchCount("player_stat_over_under", 93.5),
					sources: mlbSources({}),
				}),
			),
		).toBeNull()
	})

	it("only counts the role the stat is read from", () => {
		expect(
			decidedEarly(
				context({
					...pitchCount("player_stat_over_under", 93.5),
					sources: mlbSources({ batting: ["4019484"] }),
				}),
			),
		).toBeNull()
	})

	it("settles a numeric guess once the pitcher is pulled", () => {
		expect(
			decidedEarly(
				context({
					...pitchCount("player_stat_numeric_guess", null),
					sources: mlbSources({ pitching: ["4019484"] }),
				}),
			),
		).toMatchObject({ kind: "resolve", actualValue: 83 })
	})

	it("settles a head-to-head only once both are pulled", () => {
		const headToHead = (pulled: string[]) =>
			decidedEarly(
				context({
					...pitcher,
					...twoPlayers("player_vs_player"),
					extractor: GAME_EXTRACTORS["mlb:game:player:Pitches Thrown"],
					sources: mlbSources({ pitching: pulled }),
				}),
			)

		expect(headToHead(["4019484"])).toBeNull()
		expect(headToHead(["4019484", "32685"])).toMatchObject({
			correctOptionIds: ["a"],
		})
	})

	// Runners he left on base can still score on him.
	it("leaves earned runs to the final", () => {
		expect(
			decidedEarly(
				context({
					...pitchCount("player_stat_over_under", 4.5),
					extractor: GAME_EXTRACTORS["mlb:game:player:Earned Runs Allowed"],
					sources: mlbSources({ pitching: ["4019484"] }),
				}),
			),
		).toBeNull()
	})
})

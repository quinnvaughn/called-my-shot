import { describe, expect, it } from "vitest"
import { parseBoxScore } from "../../db/sync/box-score-parse"
import type { EspnGameSummary } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import { type LiveQuestionContext, readLiveGameQuestion } from "./live"
import { GAME_EXTRACTORS } from "./registry"

const nbaBox = () =>
	parseBoxScore(espnFixture<EspnGameSummary>("nba-summary.json"))

function context(
	overrides: Partial<LiveQuestionContext>,
): LiveQuestionContext {
	return {
		question: {
			shape: "player_stat_over_under",
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
	question: { shape, subjectPlayerId: null, subjectTeamId: null },
	options: [
		{ id: "a", playerId: "pa", teamId: null },
		{ id: "b", playerId: "pb", teamId: null },
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
						subjectPlayerId: null,
						subjectTeamId: null,
					},
					options: [
						{ id: "h", playerId: null, teamId: "home" },
						{ id: "a", playerId: null, teamId: "away" },
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
						subjectPlayerId: null,
						subjectTeamId: null,
					},
				}),
			),
		).toBeNull()
	})
})

import { describe, expect, it } from "vitest"
import { parseBoxScore } from "../../db/sync/box-score-parse"
import type { EspnGameSummary } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import {
	clinchedOver,
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

describe("clinchedOver", () => {
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
		expect(clinchedOver(context(overUnder(22.5)))).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 25,
		})
	})

	it("leaves an Over that hasn't cleared its line", () => {
		expect(clinchedOver(context(overUnder(25.5)))).toBeNull()
		expect(clinchedOver(context(overUnder(25)))).toBeNull()
	})

	it("leaves a stat that can still drop", () => {
		const { onlyRises: _, ...canDrop } =
			GAME_EXTRACTORS["nba:game:player:Points"]
		expect(
			clinchedOver(context({ ...overUnder(22.5), extractor: canDrop })),
		).toBeNull()
	})

	it("adds both teams up for a game total", () => {
		// 144-118.
		expect(
			clinchedOver(
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
			clinchedOver(
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

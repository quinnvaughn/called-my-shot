import { AUTO_RESOLVE_STATS } from "@called-my-shot/schemas"
import { describe, expect, it } from "vitest"
import { parseBoxScore } from "../../db/sync/box-score-parse"
import type { EspnGameSummary } from "../../db/sync/espn-client"
import { espnFixture } from "../../test/helpers"
import {
	decideFinalScore,
	decideGameQuestion,
	type GameQuestionContext,
	gradeLeader,
} from "./decide"
import { EXTRACTORS, GAME_EXTRACTORS, type GameSources } from "./registry"

const box = (league: "nba" | "nfl" | "mlb") =>
	parseBoxScore(espnFixture<EspnGameSummary>(`${league}-summary.json`))

const sources = (overrides: Partial<GameSources> & Pick<GameSources, "box">) =>
	({
		didNotPlayByTeam: new Map(),
		athleteGameStats: new Map(),
		...overrides,
	}) satisfies GameSources

const OVER = { id: "over", sortOrder: 0, playerId: null }
const UNDER = { id: "under", sortOrder: 1, playerId: null }

function context(overrides: Partial<GameQuestionContext>): GameQuestionContext {
	return {
		question: {
			shape: "player_stat_over_under",
			ouLine: null,
			subjectPlayerId: "player",
			subjectTeamId: null,
		},
		options: [OVER, UNDER],
		extractor: GAME_EXTRACTORS["nba:game:player:Points"],
		sources: sources({ box: box("nba") }),
		espnAthleteIdByPlayerId: new Map(),
		playerIdByEspnAthleteId: new Map(),
		espnTeamIdByTeamId: new Map(),
		homeTeamId: "home",
		awayTeamId: "away",
		...overrides,
	}
}

const playerOverUnder = (espnAthleteId: string, ouLine: number) => ({
	question: {
		shape: "player_stat_over_under" as const,
		ouLine,
		subjectPlayerId: "player",
		subjectTeamId: null,
	},
	espnAthleteIdByPlayerId: new Map([["player", espnAthleteId]]),
})

describe("decideGameQuestion - player over/under", () => {
	it("picks Over or Under off the player's line", () => {
		// 4869780 scored 25.
		expect(
			decideGameQuestion(context(playerOverUnder("4869780", 22.5))),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 25,
			evidence: { value: 25 },
		})
		expect(
			decideGameQuestion(context(playerOverUnder("4869780", 27.5))),
		).toMatchObject({ kind: "resolve", correctOptionIds: ["under"] })
	})

	it("voids the question when the player didn't play", () => {
		expect(decideGameQuestion(context(playerOverUnder("3442", 10.5)))).toEqual({
			kind: "void",
			reason: "subject_did_not_play",
		})
	})

	it("fails a push for an admin rather than guessing", () => {
		expect(
			decideGameQuestion(context(playerOverUnder("4869780", 25))),
		).toMatchObject({ kind: "fail", reason: "push", retryable: false })
	})

	it("fails when the player has no ESPN id", () => {
		expect(
			decideGameQuestion(context({ espnAthleteIdByPlayerId: new Map() })),
		).toMatchObject({ kind: "fail", reason: "missing_external_ref" })
	})

	it("retries a player missing from the box score", () => {
		expect(
			decideGameQuestion(context(playerOverUnder("999999", 10.5))),
		).toMatchObject({
			kind: "fail",
			reason: "subject_not_in_box_score",
			retryable: true,
		})
	})
})

describe("decideGameQuestion - other game shapes", () => {
	it("reads a numeric guess's actual value", () => {
		expect(
			decideGameQuestion(
				context({
					...playerOverUnder("4869780", 0),
					question: {
						shape: "player_stat_numeric_guess",
						ouLine: null,
						subjectPlayerId: "player",
						subjectTeamId: null,
					},
					options: [],
				}),
			),
		).toMatchObject({ kind: "resolve", actualValue: 25 })
	})

	it("sums both teams for a game total", () => {
		// 144 + 118 = 262.
		const decision = decideGameQuestion(
			context({
				question: {
					shape: "game_total_over_under",
					ouLine: 250.5,
					subjectPlayerId: null,
					subjectTeamId: null,
				},
				extractor: GAME_EXTRACTORS["nba:game:team:Points"],
				espnTeamIdByTeamId: new Map([
					["home", "2"],
					["away", "3"],
				]),
			}),
		)
		expect(decision).toEqual({
			kind: "resolve",
			correctOptionIds: ["over"],
			actualValue: 262,
			evidence: { value: 262 },
		})
	})

	it("gives a head-to-head to the player with more", () => {
		// 4869780 scored 25, 4065804 scored 24.
		const decision = decideGameQuestion(
			context({
				question: {
					shape: "player_vs_player",
					ouLine: null,
					subjectPlayerId: null,
					subjectTeamId: null,
				},
				options: [
					{ id: "a", sortOrder: 0, playerId: "pa" },
					{ id: "b", sortOrder: 1, playerId: "pb" },
				],
				espnAthleteIdByPlayerId: new Map([
					["pa", "4869780"],
					["pb", "4065804"],
				]),
			}),
		)
		expect(decision).toMatchObject({ kind: "resolve", correctOptionIds: ["a"] })
	})

	it("voids a head-to-head tie as a push", () => {
		// 3155535 and 4065804 both had 6 rebounds.
		const decision = decideGameQuestion(
			context({
				question: {
					shape: "player_vs_player",
					ouLine: null,
					subjectPlayerId: null,
					subjectTeamId: null,
				},
				extractor: GAME_EXTRACTORS["nba:game:player:Rebounds"],
				options: [
					{ id: "a", sortOrder: 0, playerId: "pa" },
					{ id: "b", sortOrder: 1, playerId: "pb" },
				],
				espnAthleteIdByPlayerId: new Map([
					["pa", "3155535"],
					["pb", "4065804"],
				]),
			}),
		)
		expect(decision).toEqual({ kind: "void", reason: "tie" })
	})

	it("marks the game leader, and fails when the leader isn't an option", () => {
		const nba = sources({ box: box("nba") })
		const extractor = GAME_EXTRACTORS["nba:game:player:3-Pointers Made"]
		const values = extractor.readAll?.(nba) ?? new Map<string, number>()
		const max = Math.max(...values.values())
		const leaders = [...values].filter(([, v]) => v === max).map(([id]) => id)

		const leaderContext = (pool: string[]) =>
			context({
				question: {
					shape: "player_game_stat_leader",
					ouLine: null,
					subjectPlayerId: null,
					subjectTeamId: null,
				},
				extractor,
				sources: nba,
				options: pool.map((id, i) => ({
					id: `option-${id}`,
					sortOrder: i,
					playerId: `player-${id}`,
				})),
				playerIdByEspnAthleteId: new Map(
					pool.map((id) => [id, `player-${id}`]),
				),
			})

		expect(decideGameQuestion(leaderContext(leaders))).toMatchObject({
			kind: "resolve",
			correctOptionIds: leaders.map((id) => `option-${id}`),
		})
		expect(decideGameQuestion(leaderContext([]))).toMatchObject({
			kind: "fail",
			reason: "leader_not_in_pool",
		})
	})
})

describe("decideGameQuestion - NFL", () => {
	const rosters = new Map(
		(["14", "25"] as const).map((teamId) => [
			teamId,
			new Map(
				espnFixture<{ entries: { playerId: number; didNotPlay: boolean }[] }>(
					`nfl-roster-${teamId}.json`,
				).entries.map((e) => [String(e.playerId), e.didNotPlay]),
			),
		]),
	)
	const nfl = sources({ box: box("nfl"), didNotPlayByTeam: rosters })
	const sackLine = (espnAthleteId: string) =>
		context({
			...playerOverUnder(espnAthleteId, 0.5),
			extractor: GAME_EXTRACTORS["nfl:game:player:Sacks"],
			sources: nfl,
		})

	it("reads a player who played but recorded nothing as zero", () => {
		// 3052180 is on the game roster as having played, and in no table.
		expect(decideGameQuestion(sackLine("3052180"))).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["under"],
		})
	})

	it("voids the question for a player the roster lists as not playing", () => {
		expect(decideGameQuestion(sackLine("3912189"))).toEqual({
			kind: "void",
			reason: "subject_did_not_play",
		})
	})

	it("adds rushing and receiving yards into one number", () => {
		// 3117251 ran for 68 and caught for 20: under on rushing alone.
		expect(
			decideGameQuestion(
				context({
					...playerOverUnder("3117251", 80.5),
					extractor:
						GAME_EXTRACTORS["nfl:game:player:Rushing + Receiving Yards"],
					sources: nfl,
				}),
			),
		).toMatchObject({ kind: "resolve", correctOptionIds: ["over"] })
	})

	it("reads a back with no receiving line as the rushing alone", () => {
		const all =
			GAME_EXTRACTORS["nfl:game:player:Rushing + Receiving Yards"].readAll?.(
				nfl,
			)
		expect(all?.get("4429096")).toBe(54)
		expect(all?.get("3117251")).toBe(88)
	})

	it("counts the defense's interceptions from the table totals", () => {
		const decision = decideGameQuestion(
			context({
				question: {
					shape: "team_stat_over_under",
					ouLine: 0.5,
					subjectPlayerId: null,
					subjectTeamId: "team",
				},
				extractor: GAME_EXTRACTORS["nfl:game:team:Interceptions"],
				sources: nfl,
				espnTeamIdByTeamId: new Map([["team", "25"]]),
			}),
		)
		expect(decision).toMatchObject({
			kind: "resolve",
			correctOptionIds: ["over"],
		})
	})
})

describe("decideGameQuestion - MLB", () => {
	const mlbNumeric = (
		espnAthleteId: string,
		key: keyof typeof GAME_EXTRACTORS,
		extra: Partial<GameSources> = {},
	) =>
		decideGameQuestion(
			context({
				question: {
					shape: "player_stat_numeric_guess",
					ouLine: null,
					subjectPlayerId: "player",
					subjectTeamId: null,
				},
				options: [],
				extractor: GAME_EXTRACTORS[key],
				sources: sources({ box: box("mlb"), ...extra }),
				espnAthleteIdByPlayerId: new Map([["player", espnAthleteId]]),
			}),
		)

	it("works a pitcher's game ERA and WHIP out from their line", () => {
		// 4019484: 5.0 IP, 6 H, 1 BB, 4 ER.
		expect(mlbNumeric("4019484", "mlb:game:player:ERA")).toMatchObject({
			actualValue: 7.2,
		})
		expect(mlbNumeric("4019484", "mlb:game:player:WHIP")).toMatchObject({
			actualValue: 1.4,
		})
	})

	it("reads a batter's game average from their game statistics", () => {
		const stats = espnFixture<{
			splits: {
				categories: { name: string; stats: { name: string; value: number }[] }[]
			}
		}>("mlb-athlete-41197.json")
		const athleteGameStats = new Map([
			[
				"41197",
				new Map(
					stats.splits.categories.flatMap((c) =>
						c.stats.map((s) => [`${c.name}.${s.name}`, s.value] as const),
					),
				),
			],
		])
		// 2 for 5 in this game; the box score's own .293 is season-to-date.
		expect(
			mlbNumeric("41197", "mlb:game:player:Batting Average", {
				athleteGameStats,
			}),
		).toMatchObject({ actualValue: 0.4 })
	})

	it("voids a batting question for a pitcher who never batted", () => {
		expect(mlbNumeric("4019484", "mlb:game:player:Hits")).toEqual({
			kind: "void",
			reason: "subject_did_not_play",
		})
	})
})

describe("decideFinalScore", () => {
	const matchup = (espnTeamIdByTeamId: Map<string, string>) =>
		decideFinalScore({
			options: [
				{ id: "home", teamId: "th" },
				{ id: "away", teamId: "ta" },
			],
			box: box("nba"),
			espnTeamIdByTeamId,
		})

	it("gives the matchup to the team with the higher final score", () => {
		// Team "2" beat team "3", 144-118.
		expect(
			matchup(
				new Map([
					["th", "2"],
					["ta", "3"],
				]),
			),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["home"],
			optionValues: [
				{ optionId: "home", value: 144 },
				{ optionId: "away", value: 118 },
			],
			evidence: { a: 144, b: 118 },
		})
	})

	it("fails when a team isn't linked to ESPN", () => {
		expect(matchup(new Map([["th", "2"]]))).toMatchObject({
			kind: "fail",
			reason: "missing_external_ref",
		})
	})

	it("voids a tied final score as a push", () => {
		// Both options read team "2"'s 144.
		expect(
			matchup(
				new Map([
					["th", "2"],
					["ta", "2"],
				]),
			),
		).toEqual({ kind: "void", reason: "tie" })
	})
})

describe("gradeLeader", () => {
	it("marks every option tied for the most", () => {
		expect(
			gradeLeader([
				{ optionId: "a", value: 3 },
				{ optionId: "b", value: 3 },
				{ optionId: "c", value: 1 },
			]),
		).toEqual({
			kind: "resolve",
			correctOptionIds: ["a", "b"],
			optionValues: [
				{ optionId: "a", value: 3 },
				{ optionId: "b", value: 3 },
				{ optionId: "c", value: 1 },
			],
			evidence: { max: 3 },
		})
	})

	it("voids the question when nobody recorded the stat", () => {
		expect(
			gradeLeader([
				{ optionId: "a", value: 0 },
				{ optionId: "b", value: 0 },
			]),
		).toEqual({ kind: "void", reason: "no_leader" })
	})
})

describe("EXTRACTORS", () => {
	it("covers every stat the shared table says settles automatically", () => {
		for (const key of Object.keys(AUTO_RESOLVE_STATS)) {
			expect(EXTRACTORS).toHaveProperty([key])
		}
	})
})

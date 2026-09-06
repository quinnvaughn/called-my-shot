import { describe, expect, it } from "vitest"
import { generateQuestionTitle, type TitleInput } from "./question-title"

const title = (input: TitleInput) => generateQuestionTitle(input)

describe("generateQuestionTitle - over/unders", () => {
	it("writes a player game line", () => {
		expect(
			title({
				shape: "player_stat_over_under",
				playerName: "Jayson Tatum",
				statName: "Points",
				ouLine: "27.5",
				opponentTeamName: "76ers",
			}),
		).toBe("Jayson Tatum: over/under 27.5 points vs the 76ers")
	})

	it("writes a team game line", () => {
		expect(
			title({
				shape: "team_stat_over_under",
				teamName: "Celtics",
				statName: "3-Pointers Made",
				ouLine: "14.5",
				opponentTeamName: "76ers",
			}),
		).toBe("Celtics: over/under 14.5 3-pointers made vs the 76ers")
	})

	it("writes a game total with the away @ home convention", () => {
		expect(
			title({
				shape: "game_total_over_under",
				awayTeamName: "Celtics",
				homeTeamName: "76ers",
				statName: "Points",
				ouLine: "220.5",
			}),
		).toBe("Celtics @ 76ers: over/under 220.5 points")
	})

	it("says 'per game' only for a per-game season line", () => {
		const seasonLine = {
			shape: "player_season_stat_over_under",
			playerName: "Jayson Tatum",
			statName: "Points",
			ouLine: "2000.5",
		} as const
		expect(title({ ...seasonLine, statAggregation: "total" })).toBe(
			"Jayson Tatum: over/under 2000.5 points this season",
		)
		expect(title({ ...seasonLine, statAggregation: "per_game" })).toBe(
			"Jayson Tatum: over/under 2000.5 points per game this season",
		)
	})

	it("does the same for the team season line", () => {
		expect(
			title({
				shape: "team_season_stat_over_under",
				teamName: "Celtics",
				statName: "Wins",
				ouLine: "52.5",
				statAggregation: "total",
			}),
		).toBe("Celtics: over/under 52.5 wins this season")
	})

	it("keeps the caller's pre-formatted line exactly", () => {
		// A rate-stat line needs its trailing zeros - ".300" must not become
		// ".3", which is why ouLine is a string all the way through.
		expect(
			title({
				shape: "player_stat_over_under",
				playerName: "Rafael Devers",
				statName: "Batting Average",
				ouLine: ".300",
				opponentTeamName: "Yankees",
			}),
		).toContain("over/under .300 batting average")
	})
})

describe("generateQuestionTitle - numeric guesses", () => {
	it("writes a player guess", () => {
		expect(
			title({
				shape: "player_stat_numeric_guess",
				playerName: "Jayson Tatum",
				statName: "Points",
				opponentTeamName: "76ers",
			}),
		).toBe("Guess Jayson Tatum's points vs the 76ers")
	})

	it("writes a team guess in the possessive", () => {
		expect(
			title({
				shape: "team_stat_numeric_guess",
				teamName: "Celtics",
				statName: "Rebounds",
				opponentTeamName: "76ers",
			}),
		).toBe("Guess the Celtics' rebounds vs the 76ers")
	})

	it("translates the 'Wins' catalog stat to 'win total' in possessive position", () => {
		expect(
			title({
				shape: "team_season_stat_numeric_guess",
				teamName: "Celtics",
				statName: "Wins",
				year: 2026,
			}),
		).toBe("Guess the Celtics' win total for 2026")
	})

	it("passes any other season stat through unchanged", () => {
		expect(
			title({
				shape: "team_season_stat_numeric_guess",
				teamName: "Celtics",
				statName: "Net Rating",
				year: 2026,
			}),
		).toBe("Guess the Celtics' net rating for 2026")
	})
})

describe("generateQuestionTitle - head-to-heads", () => {
	const players = {
		playerAName: "Jayson Tatum",
		playerBName: "Joel Embiid",
		statName: "Points",
	} as const

	it("uses present tense for the game-scoped matchup", () => {
		// A game date already says when it gets measured.
		expect(
			title({ shape: "player_vs_player", ...players, isRateStat: false }),
		).toBe("Jayson Tatum vs Joel Embiid: who has more points?")
	})

	it("uses future tense and a season suffix for the season matchup", () => {
		expect(
			title({
				shape: "player_vs_player_season",
				...players,
				isRateStat: false,
				statAggregation: "total",
			}),
		).toBe(
			"Jayson Tatum vs Joel Embiid: who will have more points this season?",
		)
	})

	it("says 'will average ... per game' for a per-game season matchup", () => {
		expect(
			title({
				shape: "player_vs_player_season",
				...players,
				isRateStat: false,
				statAggregation: "per_game",
			}),
		).toBe(
			"Jayson Tatum vs Joel Embiid: who will average more points per game this season?",
		)
	})

	it("says 'a higher' rather than 'more' for a rate stat", () => {
		// "more batting average" is not English.
		expect(
			title({
				shape: "player_vs_player",
				playerAName: "Rafael Devers",
				playerBName: "Aaron Judge",
				statName: "Batting Average",
				isRateStat: true,
			}),
		).toBe("Rafael Devers vs Aaron Judge: who has a higher batting average?")
	})

	it("writes a team season head-to-head", () => {
		expect(
			title({
				shape: "team_vs_team_season",
				teamAName: "Boston Celtics",
				teamBName: "Philadelphia 76ers",
				statName: "Wins",
				isRateStat: false,
				statAggregation: "total",
			}),
		).toBe(
			"Boston Celtics vs Philadelphia 76ers: who will have more wins this season?",
		)
	})

	it("writes the game winner question", () => {
		expect(
			title({
				shape: "team_vs_team",
				awayTeamName: "Celtics",
				homeTeamName: "76ers",
			}),
		).toBe("Celtics @ 76ers: who will win?")
	})
})

describe("generateQuestionTitle - stat leaders", () => {
	it("uses 'who leads in' for the game-scoped leader", () => {
		expect(
			title({
				shape: "player_game_stat_leader",
				awayTeamName: "Celtics",
				homeTeamName: "76ers",
				statName: "Rebounds",
			}),
		).toBe("Celtics @ 76ers: who leads in rebounds?")
	})

	it("scopes the season leader to its pool with 'among'", () => {
		// The pool carries no guarantee the real leader is in it, so an
		// unscoped superlative would invite a league-wide reading.
		expect(
			title({
				shape: "player_season_stat_leader",
				statName: "RAPM",
				isRateStat: false,
				statAggregation: null,
				playerNames: ["A", "B", "C"],
			}),
		).toBe("Who will have the most RAPM this season among A, B, and C?")
	})

	it("says 'the highest' for a rate stat and 'will average' per game", () => {
		expect(
			title({
				shape: "player_season_stat_leader",
				statName: "Batting Average",
				isRateStat: true,
				statAggregation: "per_game",
				playerNames: ["A", "B"],
			}),
		).toBe(
			"Who will average the highest batting average per game this season among A and B?",
		)
	})
})

describe("generateQuestionTitle - yes/no props", () => {
	it("includes the subject when there is one", () => {
		expect(
			title({
				shape: "yes_no_prop",
				subjectName: "Jayson Tatum",
				eventClause: "sign an extension by March 1",
			}),
		).toBe("Will Jayson Tatum sign an extension by March 1?")
	})

	it("drops the subject cleanly when there isn't one", () => {
		expect(
			title({
				shape: "yes_no_prop",
				subjectName: null,
				eventClause: "the season start on time",
			}),
		).toBe("Will the season start on time?")
	})
})

describe("generateQuestionTitle - awards", () => {
	const award = {
		shape: "player_season_award",
		awardName: "MVP",
		picksRequired: 1,
	} as const

	it("picks the verb the creator chose", () => {
		expect(title({ ...award, verb: "win" })).toBe("Who will win the MVP?")
		expect(title({ ...award, verb: "be" })).toBe("Who will be the MVP?")
	})

	it("switches to the pick-N form for a multi-winner award", () => {
		expect(
			title({
				...award,
				awardName: "All-NBA First Team",
				picksRequired: 5,
				verb: "be",
			}),
		).toBe("Pick the All-NBA First Team (5)")
	})

	it("puts a conference qualifier in front of the award name", () => {
		expect(title({ ...award, verb: "win", awardConferences: ["AL"] })).toBe(
			"Who will win the AL MVP?",
		)
		expect(
			title({ ...award, verb: "win", awardConferences: ["AL", "NL"] }),
		).toBe("Who will win the AL/NL MVP?")
	})

	it("spells out the NBA's conference abbreviations", () => {
		// ESPN stores "East"/"West", but the sentence wants the adjective.
		expect(title({ ...award, verb: "be", awardConferences: ["East"] })).toBe(
			"Who will be the Eastern MVP?",
		)
	})

	it("appends a division after the conference", () => {
		expect(
			title({
				...award,
				verb: "win",
				awardName: "Gold Glove - 1B",
				awardConferences: ["AL"],
				awardDivisions: ["East"],
			}),
		).toBe("Who will win the AL East Gold Glove - 1B?")
	})

	it("writes team awards the same way", () => {
		expect(
			title({
				shape: "team_season_award",
				awardName: "Championship",
				picksRequired: 1,
				verb: "win",
			}),
		).toBe("Who will win the Championship?")
	})

	it("poses finalists as an either/or list", () => {
		expect(
			title({
				shape: "player_award_finalists",
				awardName: "MVP",
				finalistNames: ["A", "B"],
			}),
		).toBe("Who will win the MVP: A or B?")
		expect(
			title({
				shape: "player_award_finalists",
				awardName: "MVP",
				finalistNames: ["A", "B", "C"],
			}),
		).toBe("Who will win the MVP: A, B, or C?")
	})
})

describe("generateQuestionTitle - stat names in sentences", () => {
	it("lower-cases ordinary catalog names", () => {
		expect(
			title({
				shape: "player_stat_numeric_guess",
				playerName: "X",
				statName: "Passing Yards",
				opponentTeamName: "Y",
			}),
		).toContain("passing yards")
	})

	it("leaves acronyms intact", () => {
		for (const stat of ["ERA", "WHIP", "RBIs"]) {
			expect(
				title({
					shape: "player_stat_numeric_guess",
					playerName: "X",
					statName: stat,
					opponentTeamName: "Y",
				}),
				stat,
			).toContain(`X's ${stat} vs`)
		}
	})

	it("lower-cases each half of a hyphenated name", () => {
		expect(
			title({
				shape: "player_stat_numeric_guess",
				playerName: "X",
				statName: "On-Base Percentage",
				opponentTeamName: "Y",
			}),
		).toContain("on-base percentage")
	})
})

describe("generateQuestionTitle - game date suffix", () => {
	const gameOn = (gameDate: string) =>
		title({
			shape: "team_vs_team",
			awayTeamName: "Celtics",
			homeTeamName: "76ers",
			gameDate,
		})

	it("appends the game's month and day when one is attached", () => {
		expect(gameOn("2026-03-03T12:00:00.000Z")).toBe(
			"Celtics @ 76ers: who will win? (Mar 3)",
		)
	})

	it("dates a game by its ET day, not the runtime's zone", () => {
		// 1am UTC on Mar 3 is still the evening of Mar 2 in ET, which is the
		// day the Games tab files this game under (Game.windowKey). Left to an
		// implicit zone this reads "Mar 3" on a UTC server and "Mar 2" in a US
		// browser, for the same game.
		expect(gameOn("2026-03-03T01:00:00.000Z")).toBe(
			"Celtics @ 76ers: who will win? (Mar 2)",
		)
	})

	it("rolls over to the next day at the ET boundary, not the UTC one", () => {
		// 04:59Z is 11:59pm ET on the 2nd; 05:00Z is midnight ET on the 3rd.
		expect(gameOn("2026-03-03T04:59:00.000Z")).toContain("(Mar 2)")
		expect(gameOn("2026-03-03T05:00:00.000Z")).toContain("(Mar 3)")
	})

	it("tracks daylight saving rather than a fixed offset", () => {
		// ET is UTC-5 in March and UTC-4 in July, so the same clock time on
		// either side of the switch lands on different days.
		expect(gameOn("2026-03-03T04:30:00.000Z")).toContain("(Mar 2)")
		expect(gameOn("2026-07-03T03:30:00.000Z")).toContain("(Jul 2)")
		expect(gameOn("2026-07-03T04:30:00.000Z")).toContain("(Jul 3)")
	})

	it("omits the suffix entirely when there is no game", () => {
		expect(
			title({
				shape: "player_season_award",
				awardName: "MVP",
				picksRequired: 1,
				verb: "win",
			}),
		).not.toContain("(")
	})
})

describe("possessive handling", () => {
	it("uses a bare apostrophe for a plural team name", () => {
		expect(
			title({
				shape: "team_stat_numeric_guess",
				teamName: "Celtics",
				statName: "Points",
				opponentTeamName: "X",
			}),
		).toContain("the Celtics' points")
	})

	it("uses 's for the rare singular team name", () => {
		expect(
			title({
				shape: "team_stat_numeric_guess",
				teamName: "Heat",
				statName: "Points",
				opponentTeamName: "X",
			}),
		).toContain("the Heat's points")
	})
})

import { describe, expect, it } from "vitest"
import type { TeamSeason } from "../../db/schema"
import type {
	EspnStandingsGroup,
	EspnTeamPostseasonEvent,
} from "../../db/sync/espn-client"
import {
	leadersLookComplete,
	parseArchiveStandings,
	postseasonOutcomes,
	seasonLabel,
} from "./archive-parse"
import { readableLine, seasonClues } from "./clues"
import { addSeasonPuzzleDays, nextSeasonPuzzleAt, seasonPuzzleDay } from "./day"
import {
	evaluateSeasonGuesses,
	legalSeasonGuesses,
	parseSeasonSquaresCode,
	refuseSeasonGuess,
	seasonGuessCount,
	seasonKey,
	seasonSquaresCode,
} from "./play"
import { planSeasonSchedule } from "./schedule"
import { seasonStats } from "./stats"

const puzzle = {
	teamId: "pats",
	year: 2007,
	clues: ["c1", "c2", "c3", "c4", "c5", "c6"],
}
const archived = new Set(
	[
		{ teamId: "pats", year: 2003 },
		{ teamId: "pats", year: 2007 },
		{ teamId: "pats", year: 2011 },
		{ teamId: "colts", year: 2006 },
		{ teamId: "colts", year: 2007 },
		{ teamId: "jets", year: 1999 },
		{ teamId: "jets", year: 2000 },
		{ teamId: "jets", year: 2001 },
	].map(seasonKey),
)

describe("evaluateSeasonGuesses", () => {
	it("shows clue 1 and nothing else before any guess", () => {
		expect(evaluateSeasonGuesses(puzzle, [])).toEqual({
			guesses: [],
			clues: ["c1"],
			status: "playing",
			over: false,
		})
	})

	it("marks the right franchise in the wrong year close, pointing at the answer", () => {
		const state = evaluateSeasonGuesses(puzzle, [
			{ teamId: "colts", year: 2007 },
			{ teamId: "pats", year: 2011 },
			{ teamId: "pats", year: 2003 },
		])
		expect(state.guesses.map((g) => [g.outcome, g.direction])).toEqual([
			["miss", null],
			["close", "earlier"],
			["close", "later"],
		])
		expect(state.clues).toEqual(["c1", "c2", "c3", "c4"])
		expect(state.over).toBe(false)
	})

	it("points a wrong team's guess at the answer's season too", () => {
		const state = evaluateSeasonGuesses(puzzle, [
			{ teamId: "jets", year: 2000 },
			{ teamId: "colts", year: 2011 },
		])
		expect(state.guesses.map((g) => [g.outcome, g.direction])).toEqual([
			["miss", "later"],
			["miss", "earlier"],
		])
	})

	it("ends solved on the exact season, with every clue", () => {
		const state = evaluateSeasonGuesses(puzzle, [
			{ teamId: "colts", year: 2006 },
			{ teamId: "pats", year: 2007 },
		])
		expect(state.status).toBe("solved")
		expect(state.clues).toHaveLength(6)
		expect(seasonGuessCount(state)).toBe(2)
		expect(seasonSquaresCode(state)).toBe("rg")
	})

	it("ends missed after six wrong guesses", () => {
		const state = evaluateSeasonGuesses(puzzle, [
			{ teamId: "jets", year: 1999 },
			{ teamId: "jets", year: 2000 },
			{ teamId: "jets", year: 2001 },
			{ teamId: "colts", year: 2006 },
			{ teamId: "pats", year: 2003 },
			{ teamId: "pats", year: 2011 },
		])
		expect(state.status).toBe("missed")
		expect(seasonGuessCount(state)).toBeNull()
		expect(seasonSquaresCode(state)).toBe("rrrryy")
	})
})

describe("refuseSeasonGuess", () => {
	it("refuses a repeat, a season not in the archive, and anything after the end", () => {
		const jets = { teamId: "jets", year: 2000 }
		expect(refuseSeasonGuess(puzzle, [jets], jets, archived)).toBe("repeat")
		expect(
			refuseSeasonGuess(puzzle, [], { teamId: "jets", year: 1950 }, archived),
		).toBe("unknown_season")
		expect(
			refuseSeasonGuess(
				puzzle,
				[{ teamId: "pats", year: 2007 }],
				jets,
				archived,
			),
		).toBe("finished")
		expect(
			refuseSeasonGuess(
				puzzle,
				[jets],
				{ teamId: "jets", year: 2001 },
				archived,
			),
		).toBeNull()
	})
})

describe("legalSeasonGuesses", () => {
	it("drops repeats, unknown seasons and anything after the game ended", () => {
		expect(
			legalSeasonGuesses(
				puzzle,
				[
					{ teamId: "jets", year: 2000 },
					{ teamId: "jets", year: 2000 },
					{ teamId: "nobody", year: 2000 },
					{ teamId: "pats", year: 2007 },
					{ teamId: "colts", year: 2007 },
				],
				archived,
			),
		).toEqual([
			{ teamId: "jets", year: 2000 },
			{ teamId: "pats", year: 2007 },
		])
	})
})

describe("parseSeasonSquaresCode", () => {
	it("reads a finished game's squares", () => {
		expect(parseSeasonSquaresCode("ryg")).toEqual(["miss", "close", "hit"])
		expect(parseSeasonSquaresCode("g")).toEqual(["hit"])
		expect(parseSeasonSquaresCode("rryyrr")).toHaveLength(6)
	})

	it("refuses squares no finished game could have", () => {
		expect(parseSeasonSquaresCode("ry")).toBeNull()
		expect(parseSeasonSquaresCode("gr")).toBeNull()
		expect(parseSeasonSquaresCode("rrrrrrg")).toBeNull()
	})
})

describe("season puzzle days", () => {
	it("turns over at midnight Eastern", () => {
		expect(seasonPuzzleDay(new Date("2026-10-21T03:59:00Z"))).toBe("2026-10-20")
		expect(seasonPuzzleDay(new Date("2026-10-21T04:00:00Z"))).toBe("2026-10-21")
		expect(
			nextSeasonPuzzleAt(new Date("2026-10-20T15:00:00Z")).toISOString(),
		).toBe("2026-10-21T04:00:00.000Z")
	})

	it("steps over the DST change without skipping a day", () => {
		expect(addSeasonPuzzleDays("2026-10-31", 1)).toBe("2026-11-01")
		expect(addSeasonPuzzleDays("2026-11-01", 1)).toBe("2026-11-02")
	})
})

describe("seasonStats", () => {
	it("counts the distribution, misses and streaks", () => {
		const stats = seasonStats(
			[
				{ day: "2026-10-15", guessCount: 2 },
				{ day: "2026-10-16", guessCount: null },
				{ day: "2026-10-18", guessCount: 4 },
				{ day: "2026-10-19", guessCount: 4 },
			],
			"2026-10-20",
		)
		expect(stats.played).toBe(4)
		expect(stats.solved).toBe(3)
		expect(stats.distribution).toEqual([0, 1, 0, 2, 0, 0])
		expect(stats.bestStreak).toBe(2)
		expect(stats.currentStreak).toBe(2)
	})
})

describe("planSeasonSchedule", () => {
	const today = "2026-10-20"
	const first = () => 0

	it("gives each league a turn before any league goes again", () => {
		const plan = planSeasonSchedule(
			today,
			[{ day: "2026-10-19", leagueId: "nba", teamId: "t0" }],
			[
				{ id: "nba1", leagueId: "nba", teamId: "t1" },
				{ id: "nfl1", leagueId: "nfl", teamId: "t2" },
				{ id: "nfl2", leagueId: "nfl", teamId: "t3" },
				{ id: "mlb1", leagueId: "mlb", teamId: "t4" },
			],
			first,
		)
		expect(plan.slice(0, 3).map((p) => p.teamSeasonId)).toEqual([
			"mlb1",
			"nfl1",
			"nba1",
		])
		// With only one league left, it repeats rather than leaving a gap.
		expect(plan[3]).toEqual({ teamSeasonId: "nfl2", day: "2026-10-23" })
	})

	it("leaves days that already have a puzzle alone", () => {
		const plan = planSeasonSchedule(
			today,
			[{ day: "2026-10-20", leagueId: "nfl", teamId: "t9" }],
			[{ id: "nba1", leagueId: "nba", teamId: "t4" }],
			first,
		)
		expect(plan).toEqual([{ teamSeasonId: "nba1", day: "2026-10-21" }])
	})

	it("rests a franchise that ran recently", () => {
		const plan = planSeasonSchedule(
			today,
			[{ day: "2026-10-01", leagueId: "nfl", teamId: "pats" }],
			[
				{ id: "again", leagueId: "nfl", teamId: "pats" },
				{ id: "fresh", leagueId: "nfl", teamId: "jets" },
			],
			first,
		)
		// Thirty days after its last run, and not before.
		expect(plan).toEqual([
			{ teamSeasonId: "fresh", day: "2026-10-20" },
			{ teamSeasonId: "again", day: "2026-10-31" },
		])
	})
})

const entry = (
	id: string,
	name: string,
	stats: Record<string, number>,
): NonNullable<EspnStandingsGroup["standings"]>["entries"][number] => ({
	team: { id, displayName: name },
	stats: Object.entries(stats).map(([key, value]) => ({ name: key, value })),
})

describe("parseArchiveStandings", () => {
	it("reads conference, division and place, collapsing padded names", () => {
		const rows = parseArchiveStandings(
			{
				name: "National Football League",
				children: [
					{
						name: "American Football Conference",
						children: [
							{
								name: "AFC Central",
								standings: {
									entries: [
										entry("10", "Houston        Oilers", {
											wins: 7,
											losses: 9,
											pointsFor: 348,
											pointsAgainst: 324,
										}),
										entry("23", "Pittsburgh Steelers", {
											wins: 11,
											losses: 5,
											pointsFor: 407,
											pointsAgainst: 327,
										}),
									],
								},
							},
						],
					},
				],
			},
			"nfl",
			1995,
		)
		expect(rows.map((r) => [r.name, r.division, r.divisionRank])).toEqual([
			["Pittsburgh Steelers", "AFC Central", 1],
			["Houston Oilers", "AFC Central", 2],
		])
		expect(rows[0]?.conference).toBe("American Football Conference")
	})

	it("leaves out the current season ESPN answers with for a year it lacks", () => {
		const rows = parseArchiveStandings(
			{
				name: "National Hockey League",
				children: [
					{
						name: "Eastern Conference",
						standings: {
							season: 2027,
							entries: [entry("12", "Carolina Hurricanes", { wins: 3 })],
						},
					},
				],
			},
			"nhl",
			1985,
		)
		expect(rows).toEqual([])
	})

	it("counts an old NHL overtime loss as a loss, a new one apart", () => {
		const group = (year: number) =>
			parseArchiveStandings(
				{
					name: "National Hockey League",
					children: [
						{
							name: "Eastern Conference",
							standings: {
								entries: [
									entry("5", "Pittsburgh Penguins", {
										wins: 29,
										losses: 15,
										ties: 3,
										otLosses: 1,
										pointsFor: 181,
										pointsAgainst: 158,
									}),
								],
							},
						},
					],
				},
				"nhl",
				year,
			)[0]
		expect(group(1995)).toMatchObject({
			losses: 16,
			otLosses: 0,
			division: null,
		})
		expect(group(2010)).toMatchObject({ losses: 15, otLosses: 1 })
	})
})

const game = (
	id: string,
	date: string,
	winner: string,
	loser: string,
): EspnTeamPostseasonEvent => ({
	id,
	date,
	competitions: [
		{
			competitors: [
				{ team: { id: winner }, winner: true },
				{ team: { id: loser }, winner: false },
			],
		},
	],
})

describe("postseasonOutcomes", () => {
	it("counts rounds back from the final, byes included", () => {
		// A bye team (A) enters a round later than B, which won a wild card game.
		const outcomes = postseasonOutcomes([
			game("1", "2008-01-05", "B", "C"),
			game("2", "2008-01-12", "A", "B"),
			game("3", "2008-01-12", "D", "E"),
			game("4", "2008-01-20", "A", "D"),
			game("5", "2008-01-20", "F", "G"),
			game("6", "2008-02-03", "F", "A"),
		])
		expect(Object.fromEntries(outcomes)).toEqual({
			F: { outcome: "champion", roundsFromFinal: 0 },
			A: { outcome: "finalist", roundsFromFinal: 0 },
			D: { outcome: "lost_semifinal", roundsFromFinal: 1 },
			G: { outcome: "lost_semifinal", roundsFromFinal: 1 },
			B: { outcome: "lost_round", roundsFromFinal: 2 },
			E: { outcome: "lost_round", roundsFromFinal: 2 },
			C: { outcome: "lost_round", roundsFromFinal: 3 },
		})
	})

	it("groups a series' games and reads the series winner", () => {
		const outcomes = postseasonOutcomes([
			game("1", "1996-05-01", "CHI", "NY"),
			game("2", "1996-05-03", "NY", "CHI"),
			game("3", "1996-05-05", "CHI", "NY"),
			game("4", "1996-06-05", "CHI", "SEA"),
			game("5", "1996-06-07", "SEA", "CHI"),
			game("6", "1996-06-09", "CHI", "SEA"),
		])
		expect(outcomes.get("CHI")?.outcome).toBe("champion")
		expect(outcomes.get("SEA")?.outcome).toBe("finalist")
		expect(outcomes.get("NY")?.outcome).toBe("lost_semifinal")
	})

	it("is empty for a season with no postseason", () => {
		expect(postseasonOutcomes([]).size).toBe(0)
	})
})

describe("leadersLookComplete", () => {
	it("keeps out a season missing its real leaders", () => {
		// 1985 Bears: Walter Payton missing, so the QB leads in rushing.
		expect(
			leadersLookComplete("nfl", [
				{
					category: "passingLeader",
					athlete: "Jim McMahon",
					line: "178/313, 2392 YDS, 15 TD, 11 INT",
				},
				{
					category: "rushingLeader",
					athlete: "Jim McMahon",
					line: "47 CAR, 252 YDS, 3 TD",
				},
				{
					category: "receivingLeader",
					athlete: "Willie Gault",
					line: "33 REC, 704 YDS, 1 TD",
				},
			]),
		).toBe(false)
		// 1990-91 Celtics: Larry Bird missing, so a center leads in assists.
		expect(
			leadersLookComplete("nba", [
				{ category: "pointsPerGame", athlete: "Kevin McHale", line: "18.4" },
				{ category: "reboundsPerGame", athlete: "Kevin McHale", line: "7.1" },
				{ category: "assistsPerGame", athlete: "Kevin McHale", line: "1.9" },
			]),
		).toBe(false)
	})

	it("passes a complete season", () => {
		expect(
			leadersLookComplete("nfl", [
				{
					category: "passingLeader",
					athlete: "Tom Brady",
					line: "398/578, 4806 YDS, 50 TD, 8 INT",
				},
				{
					category: "rushingLeader",
					athlete: "Laurence Maroney",
					line: "185 CAR, 835 YDS, 6 TD",
				},
				{
					category: "receivingLeader",
					athlete: "Randy Moss",
					line: "98 REC, 1493 YDS, 23 TD",
				},
			]),
		).toBe(true)
	})
})

const season = (overrides: Partial<TeamSeason>): TeamSeason => ({
	id: "s",
	leagueId: "l",
	teamId: "t",
	year: 2007,
	label: "2007",
	name: "New England Patriots",
	wins: 16,
	losses: 0,
	ties: 0,
	otLosses: 0,
	pointsFor: 589,
	pointsAgainst: 274,
	conference: "American Football Conference",
	division: "AFC East",
	divisionRank: 1,
	outcome: "finalist",
	roundsFromFinal: 0,
	leaders: [
		{
			category: "passingLeader",
			athlete: "Tom Brady",
			line: "398/578, 4806 YDS, 50 TD, 8 INT",
		},
		{
			category: "rushingLeader",
			athlete: "Laurence Maroney",
			line: "185 CAR, 835 YDS, 6 TD",
		},
		{
			category: "receivingLeader",
			athlete: "Randy Moss",
			line: "98 REC, 1493 YDS, 23 TD",
		},
	],
	puzzleReady: true,
	createdAt: new Date(),
	...overrides,
})

describe("seasonClues", () => {
	it("writes six clues from vague to the star's name", () => {
		expect(seasonClues("nfl", season({}))).toEqual([
			"Went 16-0. Scored 589 points and allowed 274.",
			"Finished 1st in their division. Lost in the Super Bowl.",
			"Their leading receiver: 98 catches, 1,493 yards, 23 TD.",
			"Played in the AFC East.",
			"Laurence Maroney led them in rushing: 185 carries, 835 yards, 6 TD.",
			"Tom Brady led them in passing: 398 of 578, 4,806 yards, 50 TD, 8 INT.",
		])
	})

	it("names the round a team went out in, and the NBA's one-word divisions", () => {
		const clues = seasonClues(
			"nba",
			season({
				wins: 47,
				losses: 35,
				pointsFor: 7971,
				pointsAgainst: 7781,
				conference: "Eastern Conference",
				division: "Atlantic",
				divisionRank: 2,
				outcome: "lost_round",
				roundsFromFinal: 2,
				leaders: [
					{ category: "pointsPerGame", athlete: "Patrick Ewing", line: "22.5" },
					{
						category: "reboundsPerGame",
						athlete: "Patrick Ewing",
						line: "10.6",
					},
					{ category: "assistsPerGame", athlete: "Anthony Mason", line: "4.4" },
				],
			}),
		)
		expect(clues?.[0]).toBe(
			"Went 47-35. Averaged 97.2 points a game and allowed 94.9.",
		)
		expect(clues?.[1]).toBe(
			"Finished 2nd in their division. Lost in the conference semifinals.",
		)
		expect(clues?.[3]).toBe("Played in the Atlantic Division.")
		expect(clues?.[4]).toBe("Anthony Mason led them in assists, 4.4 a game.")
	})

	it("doesn't name the star early when he leads the second category too", () => {
		const clues = seasonClues(
			"nhl",
			season({
				division: null,
				conference: "Western Conference",
				ties: 4,
				outcome: "missed",
				roundsFromFinal: null,
				leaders: [
					{ category: "points", athlete: "Wayne Gretzky", line: "142" },
					{ category: "goals", athlete: "Wayne Gretzky", line: "40" },
					{ category: "assists", athlete: "Luc Robitaille", line: "60" },
				],
			}),
		)
		expect(clues?.[1]).toBe(
			"Finished 1st in their conference. Missed the playoffs.",
		)
		expect(clues?.[4]).toBe("Luc Robitaille led them with 60 assists.")
		expect(clues?.[5]).toBe("Wayne Gretzky led them with 142 points.")
	})

	it("leaves scoring out where ESPN has no point totals, and doesn't repeat clue 5's category in clue 3", () => {
		const clues = seasonClues(
			"nba",
			season({
				wins: 57,
				losses: 25,
				pointsFor: 0,
				pointsAgainst: 0,
				division: "Central",
				leaders: [
					{ category: "pointsPerGame", athlete: "LeBron James", line: "25.3" },
					{ category: "reboundsPerGame", athlete: "Kevin Love", line: "9.9" },
					{ category: "assistsPerGame", athlete: "LeBron James", line: "6.8" },
				],
			}),
		)
		expect(clues?.[0]).toBe("Went 57-25.")
		expect(clues?.[2]).toBe("Their assists leader averaged 6.8 a game.")
		expect(clues?.[4]).toBe("Kevin Love led them in rebounds, 9.9 a game.")
	})

	it("names the goalie when the NHL star leads every skater category", () => {
		const clues = seasonClues(
			"nhl",
			season({
				division: null,
				conference: "Western Conference",
				leaders: [
					{ category: "points", athlete: "Joe Sakic", line: "118" },
					{ category: "goals", athlete: "Joe Sakic", line: "54" },
					{ category: "assists", athlete: "Joe Sakic", line: "64" },
					{ category: "wins", athlete: "Patrick Roy", line: "40" },
				],
			}),
		)
		expect(clues?.[2]).toBe("Their assists leader had 64.")
		expect(clues?.[4]).toBe("Patrick Roy led their goalies with 40 wins.")
	})

	it("makes no clues without the star's category", () => {
		expect(seasonClues("nfl", season({ leaders: [] }))).toBeNull()
	})

	it("reads ESPN's stat lines as a sentence would", () => {
		expect(readableLine("185 CAR, 1835 YDS, 6 TD")).toBe(
			"185 carries, 1,835 yards, 6 TD",
		)
	})
})

describe("seasonLabel", () => {
	it("spans the new year for the NBA and NHL", () => {
		expect(seasonLabel("nba", 1996)).toBe("1995-96")
		expect(seasonLabel("nhl", 2000)).toBe("1999-00")
		expect(seasonLabel("mlb", 1998)).toBe("1998")
	})
})

import { describe, expect, it } from "vitest"
import type {
	EspnDepthChart,
	EspnDepthChartPosition,
	EspnProbable,
	EspnProbablesEvent,
} from "./espn-client"
import {
	parseBattingOrders,
	parseNbaDepthChart,
	parseNflDepthChart,
	parseProbableGoalies,
	parseProbables,
} from "./starters-parse"

// Trimmed from live ESPN responses (2026-09-11) down to the fields the
// parsers read.
const probable = (
	id: string,
	displayName: string,
	statistics?: [string, string][],
): EspnProbable => ({
	name: "probableStartingPitcher",
	abbreviation: "SP",
	athlete: { id, displayName },
	statistics: statistics?.map(([abbreviation, displayValue]) => ({
		abbreviation,
		displayValue,
	})),
})

const mlbEvent = (
	home: EspnProbable[] | undefined,
	away: EspnProbable[] | undefined,
): EspnProbablesEvent => ({
	id: "401816899",
	competitions: [
		{
			competitors: [
				{ homeAway: "home", team: { id: "10" }, probables: home },
				{ homeAway: "away", team: { id: "2" }, probables: away },
			],
		},
	],
})

const slot = (
	abbreviation: string,
	...athletes: [string, string, string?][]
): EspnDepthChartPosition => ({
	position: { abbreviation },
	athletes: athletes.map(([id, displayName, injury]) => ({
		id,
		displayName,
		injuries: injury ? [{ status: injury }] : [],
	})),
})

describe("parseProbables", () => {
	it("builds the W-L and ERA line and clears a team with no probable", () => {
		const groups = parseProbables(
			mlbEvent(
				[
					probable("33696", "Carlos Rodon", [
						["W", "5"],
						["L", "3"],
						["ERA", "3.09"],
						["K", "140"],
					]),
				],
				undefined,
			),
		)

		expect(groups).toEqual([
			{
				espnTeamId: "10",
				role: "starting_pitcher",
				starters: [
					{
						espnAthleteId: "33696",
						playerName: "Carlos Rodon",
						position: "SP",
						sortOrder: 1,
						statLine: "5-3, 3.09 ERA",
						injuryStatus: null,
					},
				],
			},
			{ espnTeamId: "2", role: "starting_pitcher", starters: [] },
		])
	})

	it("leaves the stat line off when ESPN is missing part of it", () => {
		const [home] = parseProbables(
			mlbEvent([probable("1", "No Record", [["W", "0"]])], []),
		)
		expect(home?.starters[0]?.statLine).toBeNull()
	})
})

describe("parseProbableGoalies", () => {
	it("takes each team's probable starting goalie and ignores a pitcher", () => {
		// The NHL scoreboard's shape, verified live 2026-10-01.
		const goalie: EspnProbable = {
			name: "probableStartingGoalie",
			abbreviation: "SG",
			athlete: { id: "3151297", displayName: "Igor Shesterkin" },
			statistics: [],
		}
		const groups = parseProbableGoalies(
			mlbEvent([goalie], [probable("33696", "Carlos Rodon")]),
		)

		expect(groups).toEqual([
			{
				espnTeamId: "10",
				role: "starting_goalie",
				starters: [
					{
						espnAthleteId: "3151297",
						playerName: "Igor Shesterkin",
						position: "G",
						sortOrder: 1,
						statLine: null,
						injuryStatus: null,
					},
				],
			},
			{ espnTeamId: "2", role: "starting_goalie", starters: [] },
		])
	})
})

describe("parseBattingOrders", () => {
	it("orders posted starters by batting spot and skips teams with no lineup yet", () => {
		const groups = parseBattingOrders([
			{
				homeAway: "home",
				team: { id: "16" },
				roster: [
					{
						starter: true,
						batOrder: 2,
						position: { abbreviation: "RF" },
						athlete: { id: "4142424", displayName: "Seiya Suzuki" },
					},
					{
						starter: false,
						batOrder: 1,
						position: { abbreviation: "LF" },
						athlete: { id: "33711", displayName: "Bench Bat" },
					},
					{
						starter: true,
						batOrder: 1,
						position: { abbreviation: "CF" },
						athlete: { id: "4717833", displayName: "Pete Crow-Armstrong" },
					},
					{
						starter: true,
						batOrder: 0,
						position: { abbreviation: "SP" },
						athlete: { id: "99", displayName: "Starting Pitcher" },
					},
				],
			},
			{ homeAway: "away", team: { id: "23" }, roster: [] },
		])

		expect(groups).toHaveLength(1)
		expect(groups[0]?.espnTeamId).toBe("16")
		expect(
			groups[0]?.starters.map((s) => [s.sortOrder, s.position, s.playerName]),
		).toEqual([
			[1, "CF", "Pete Crow-Armstrong"],
			[2, "RF", "Seiya Suzuki"],
		])
	})
})

describe("parseNflDepthChart", () => {
	const charts: EspnDepthChart[] = [
		{
			name: "Base 3-4 D",
			positions: {
				lde: slot("LDE", ["1", "Shelby Harris"]),
				nt: slot("NT", ["2", "DJ Reader"]),
			},
		},
		{
			name: "Special Teams",
			positions: {
				pk: slot("PK", ["3", "Dominic Zvada"]),
				p: slot("P", ["4", "Jordan Stout"]),
			},
		},
		{
			name: "3WR 1TE",
			positions: {
				wr1: slot("WR", ["5", "Malik Nabers", "Questionable"]),
				wr2: slot("WR", ["6", "Malachi Fields"]),
				lt: slot("LT", ["7", "Andrew Thomas"]),
				qb: slot("QB", ["8", "Jaxson Dart"], ["9", "Jameis Winston"]),
				rb: slot("RB", ["10", "Cam Skattebo"]),
			},
		},
		{
			name: "Nickel D",
			positions: { nb: slot("NB", ["11", "Dru Phillips"]) },
		},
	]

	it("takes the first-string player per spot, backfield first, and skips special teams", () => {
		const groups = parseNflDepthChart("19", charts)

		expect(groups.map((g) => g.role)).toEqual(["defense", "offense"])
		const offense = groups.find((g) => g.role === "offense")
		expect(
			offense?.starters.map((s) => [s.position, s.playerName, s.injuryStatus]),
		).toEqual([
			["QB", "Jaxson Dart", null],
			["RB", "Cam Skattebo", null],
			["WR", "Malik Nabers", "Questionable"],
			["WR", "Malachi Fields", null],
			["LT", "Andrew Thomas", null],
		])
	})

	it("ignores a second defensive chart rather than letting it replace the first", () => {
		const defense = parseNflDepthChart("19", charts).find(
			(g) => g.role === "defense",
		)
		expect(defense?.starters.map((s) => s.playerName)).toEqual([
			"Shelby Harris",
			"DJ Reader",
		])
	})
})

describe("parseNbaDepthChart", () => {
	it("returns the starting five in ESPN's position order", () => {
		const groups = parseNbaDepthChart("2", [
			{
				name: "Depth Chart",
				positions: {
					pg: slot("PG", ["1", "Derrick White"], ["2", "Payton Pritchard"]),
					sg: slot("SG", ["3", "Baylor Scheierman"]),
					sf: slot("SF", ["4", "Paul George"]),
					pf: slot("PF", ["5", "Jayson Tatum"]),
					c: slot("C", ["6", "Neemias Queta"]),
				},
			},
		])

		expect(groups).toHaveLength(1)
		expect(groups[0]?.role).toBe("starter")
		expect(groups[0]?.starters.map((s) => s.position)).toEqual([
			"PG",
			"SG",
			"SF",
			"PF",
			"C",
		])
	})

	it("produces nothing when ESPN has no chart for the team", () => {
		expect(parseNbaDepthChart("2", [])).toEqual([])
	})
})

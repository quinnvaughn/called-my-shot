import { describe, expect, it } from "vitest"
import {
	defenseTiles,
	headline,
	type MatchupSide,
	matchupHeadline,
	matchupTiles,
	round,
	type Subject,
	sectionTitle,
	seriesSummary,
	summaryRows,
	supportingTiles,
} from "./stat-context"

const game = (gameId: string, value: number | null, didNotPlay = false) => ({
	gameId,
	date: "2026-10-01",
	opponentTeamId: "t2",
	isHome: true,
	value,
	didNotPlay,
})

const subject = (overrides: Partial<Subject> = {}): Subject => ({
	label: "Player",
	player: null,
	team: null,
	recentGames: [],
	seasonToDate: null,
	home: null,
	away: null,
	rest: null,
	opponentAllowed: null,
	teamShare: null,
	usage: null,
	...overrides,
})

const record = (
	wins: number,
	losses: number,
	otLosses: number | null = null,
) => ({
	games: wins + losses,
	wins,
	losses,
	ties: 0,
	otLosses,
})

const side = (overrides: Partial<MatchupSide> = {}): MatchupSide => ({
	label: "Home",
	teamId: "t1",
	isHome: true,
	restDays: null,
	team: null,
	differential: null,
	overall: null,
	inThisRole: null,
	headToHead: null,
	lastTen: null,
	streak: null,
	recentResults: [],
	...overrides,
})

const teams = { t1: "SEA", t2: "HOU" }

describe("sectionTitle", () => {
	it("qualifies the fixed name with the stat when there is one", () => {
		expect(sectionTitle("Receiving yards")).toBe("The stats · Receiving yards")
		expect(sectionTitle("")).toBe("The stats")
	})
})

describe("round", () => {
	it("keeps integers whole and everything else to one decimal", () => {
		expect(round(12)).toBe("12")
		expect(round(12.345)).toBe("12.3")
	})
})

describe("headline", () => {
	it("is null with no game played", () => {
		expect(headline(subject())).toBeNull()
		expect(
			headline(subject({ recentGames: [game("g1", null, true)] })),
		).toBeNull()
	})

	it("reads one game as the last game", () => {
		expect(headline(subject({ recentGames: [game("g1", 75)] }))).toEqual({
			value: "75",
			label: "last game",
		})
	})

	it("averages the played games and skips the ones sat out", () => {
		expect(
			headline(
				subject({
					recentGames: [game("g1", 80), game("g2", null, true), game("g3", 65)],
				}),
			),
		).toEqual({ value: "72.5", label: "per game, last 2" })
	})
})

describe("supportingTiles", () => {
	it("is empty when nothing clears its threshold", () => {
		expect(
			supportingTiles(
				subject({
					seasonToDate: { games: 1, mean: 70, overLine: 1 },
					home: { games: 1, mean: 70 },
					away: { games: 3, mean: 60 },
				}),
				teams,
			),
		).toEqual([])
	})

	it("orders the line, usage, splits, share and opponent tiles", () => {
		const tiles = supportingTiles(
			subject({
				seasonToDate: { games: 6, mean: 70, overLine: 4 },
				usage: { label: "targets", games: 6, perGame: 8.5, sharePct: 24 },
				home: { games: 3, mean: 80 },
				away: { games: 3, mean: 60 },
				rest: {
					medianRestDays: 6,
					shortRest: { games: 2, mean: 55 },
					longRest: { games: 4, mean: 75 },
				},
				teamShare: { sharePct: 31.25, games: 6 },
				opponentAllowed: {
					teamId: "t2",
					games: 6,
					meanAllowed: 210,
					positions: ["WR", "SS"],
				},
			}),
			teams,
		)
		expect(tiles).toEqual([
			{ value: "4 of 6", label: "cleared the line" },
			{ value: "24%", label: "of team targets" },
			{ value: "8.5", label: "targets per game" },
			{ value: "80 / 60", label: "home / away" },
			{ value: "75 / 55", label: "6+ days rest / less" },
			{ value: "31.3%", label: "of team total" },
			{ value: "210", label: "HOU allowed to WRs/SS, per game" },
		])
	})

	it("says when a share or allowance covers only the last game", () => {
		const tiles = supportingTiles(
			subject({
				usage: { label: "carries", games: 1, perGame: 15, sharePct: 60 },
				teamShare: { sharePct: 40, games: 1 },
				opponentAllowed: {
					teamId: "unknown",
					games: 1,
					meanAllowed: 120,
					positions: [],
				},
			}),
			teams,
		)
		expect(tiles.map((tile) => tile.label)).toEqual([
			"of team carries, last game",
			"carries, last game",
			"of team total, last game",
			"opponent allowed, last game",
		])
	})
})

describe("defenseTiles", () => {
	it("names each defense and its sample", () => {
		expect(
			defenseTiles(
				[
					{ teamId: "t1", games: 4, meanAllowed: 102.5 },
					{ teamId: "t9", games: 1, meanAllowed: 90 },
				],
				teams,
			),
		).toEqual([
			{ value: "102.5", label: "SEA allowed, per game" },
			{ value: "90", label: "opponent allowed, last game" },
		])
	})
})

describe("matchupHeadline", () => {
	const overall = {
		games: 10,
		pointsForPerGame: 24,
		pointsAgainstPerGame: 20.5,
		overLine: 6,
	}

	it("is null until there's a record's worth of games", () => {
		expect(
			matchupHeadline(side({ overall: { ...overall, games: 1 } }), "SCORING"),
		).toBeNull()
	})

	it("leads a scoring question with the combined total", () => {
		expect(matchupHeadline(side({ overall }), "SCORING")).toEqual({
			value: "44.5",
			label: "combined per game, 10 games",
		})
	})

	it("leads a who-wins question with the differential", () => {
		expect(matchupHeadline(side({ overall }), "WINNER")).toBeNull()
		expect(
			matchupHeadline(
				side({
					overall,
					differential: { kind: "NET_RATING", value: 3.46, games: 10 },
				}),
				"WINNER",
			),
		).toEqual({ value: "+3.5", label: "net rating, 10 games" })
		expect(
			matchupHeadline(
				side({
					overall,
					differential: { kind: "RUN_DIFFERENTIAL", value: -12.4, games: 1 },
				}),
				"WINNER",
			),
		).toEqual({ value: "−12", label: "run differential, 1 game" })
	})
})

describe("matchupTiles", () => {
	it("is empty with no overall figures", () => {
		expect(matchupTiles(side({ lastTen: record(6, 4) }), "WINNER")).toEqual([])
	})

	it("builds role, last ten, total, scoring, streak and rest tiles", () => {
		const tiles = matchupTiles(
			side({
				isHome: false,
				overall: {
					games: 10,
					pointsForPerGame: 3.2,
					pointsAgainstPerGame: 2.8,
					overLine: 6,
				},
				inThisRole: record(3, 2, 1),
				lastTen: record(6, 4),
				streak: { outcome: "WIN", length: 3 },
				restDays: 1,
			}),
			"SCORING",
		)
		expect(tiles).toEqual([
			{ value: "3–2–1", label: "on the road" },
			{ value: "6–4", label: "last 10" },
			{ value: "6 of 10", label: "cleared the total" },
			{ value: "3.2 / 2.8", label: "scored / allowed" },
			{ value: "W3", label: "current streak" },
			{ value: "1", label: "day of rest" },
		])
	})

	it("leaves out the total off a scoring question and a one-game streak", () => {
		const labels = matchupTiles(
			side({
				overall: {
					games: 10,
					pointsForPerGame: 24,
					pointsAgainstPerGame: 20,
					overLine: 6,
				},
				streak: { outcome: "LOSS", length: 1 },
			}),
			"WINNER",
		).map((tile) => tile.label)
		expect(labels).toEqual(["scored / allowed"])
	})
})

describe("seriesSummary", () => {
	const first = side({ teamId: "t1" })
	const second = side({ teamId: "t2", isHome: false })

	it("calls an even series tied", () => {
		expect(seriesSummary(record(2, 2), first, second, teams)).toBe(
			"series tied 2-2",
		)
	})

	it("names whichever side leads", () => {
		expect(seriesSummary(record(9, 2), first, second, teams)).toBe(
			"SEA leads 9-2",
		)
		expect(
			seriesSummary({ ...record(2, 9), ties: 1 }, first, second, teams),
		).toBe("HOU leads 9-2-1")
	})
})

describe("summaryRows", () => {
	it("gives each subject its headline, leaving out one with none", () => {
		const rows = summaryRows({
			ranking: [],
			matchup: null,
			subjects: [
				subject({
					label: "Jaylen Warren",
					recentGames: [game("g1", 127), game("g2", 93), game("g3", 101)],
				}),
				subject({ label: "Bucky Irving", recentGames: [game("g1", null, true)] }),
			],
		})
		expect(rows).toEqual([
			{
				key: "Jaylen Warren",
				name: "Jaylen Warren",
				value: "107",
				label: "per game, last 3",
			},
		])
	})

	it("leads a pool with its first three, saying how many games each is over", () => {
		const entry = (playerId: string, mean: number, games: number) => ({
			playerId,
			player: null,
			label: playerId,
			mean,
			games,
			opponentTeamId: null,
			isHome: true,
		})
		const rows = summaryRows({
			ranking: [
				entry("A", 31.25, 4),
				entry("B", 28, 1),
				entry("C", 25, 3),
				entry("D", 20, 3),
			],
			matchup: null,
			subjects: [],
		})
		expect(rows.map((r) => [r.name, r.value, r.label])).toEqual([
			["A", "31.3", "4 games"],
			["B", "28", "last game"],
			["C", "25", "3 games"],
		])
	})
})

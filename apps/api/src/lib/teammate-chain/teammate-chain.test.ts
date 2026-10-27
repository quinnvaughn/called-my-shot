import { describe, expect, it } from "vitest"
import type { ChainMove } from "../../db/schema"
import { initials, mysteryClues } from "./clues"
import {
	buildChainPuzzle,
	buildLeagueGraph,
	chainRoutes,
	chainSignature,
	linkDistances,
} from "./graph"
import { distancesToTarget, isDeadEnd, linksLeft, pickMystery } from "./help"
import {
	CHAIN_CLUE_COUNT,
	CHAIN_MAX_MIDDLE,
	type ChainChecks,
	type ChainInput,
	chainDayPoints,
	chainResultCode,
	evaluateChainMoves,
	judgeChainInputs,
	type Linked,
	parseChainResultCode,
	refuseChainInput,
} from "./play"
import { chainLeagueOrder, restingPlayers } from "./schedule"
import { chainStats } from "./stats"
import { compactYears, sharedSeasonsLabel } from "./teammates"

const ends = { startPlayerId: "start", targetPlayerId: "target" }

// start - a - b - target, and start - c (a dead end).
const pairs = new Set(["start:a", "a:b", "b:target", "start:c"])
const linked: Linked = (x, y) =>
	pairs.has(`${x}:${y}`) || pairs.has(`${y}:${x}`)
// A hint about "a" from the start, nothing past it.
const checks: ChainChecks = {
	linked,
	inLeague: () => true,
	mystery: (state) => (state.chain.length === 0 ? "a" : null),
}
const pick = (playerId: string): ChainInput => ({ kind: "pick", playerId })
const hint: ChainInput = { kind: "hint" }

describe("evaluateChainMoves", () => {
	it("solves when an added player connects, counting links as middle players plus one", () => {
		const state = evaluateChainMoves([
			{ kind: "add", playerId: "a", connects: false },
			{ kind: "miss", playerId: "x" },
			{ kind: "add", playerId: "b", connects: true },
		])
		expect(state).toMatchObject({
			status: "solved",
			over: true,
			chain: ["a", "b"],
			misses: 1,
			links: 3,
		})
	})

	it("undoes the newest player and ends on give up", () => {
		const state = evaluateChainMoves([
			{ kind: "add", playerId: "c", connects: false },
			{ kind: "undo" },
			{ kind: "give_up" },
		])
		expect(state).toMatchObject({
			status: "gave_up",
			chain: [],
			links: null,
		})
	})

	it("ignores anything after the game ended", () => {
		const moves: ChainMove[] = [
			{ kind: "give_up" },
			{ kind: "add", playerId: "a", connects: true },
		]
		expect(evaluateChainMoves(moves).status).toBe("gave_up")
	})
})

describe("judgeChainInputs", () => {
	it("adds teammates of the chain's last player, misses anyone else, and connects to the target", () => {
		const moves = judgeChainInputs(
			ends,
			[pick("b"), pick("a"), pick("b")],
			checks,
		)
		expect(moves).toEqual([
			{ kind: "miss", playerId: "b" },
			{ kind: "add", playerId: "a", connects: false },
			{ kind: "add", playerId: "b", connects: true },
		])
	})

	it("backs out of a dead end with undo", () => {
		const moves = judgeChainInputs(
			ends,
			[pick("c"), { kind: "undo" }, pick("a"), pick("b")],
			checks,
		)
		expect(evaluateChainMoves(moves)).toMatchObject({
			status: "solved",
			chain: ["a", "b"],
			links: 3,
		})
	})

	it("drops inputs that couldn't have been made", () => {
		const moves = judgeChainInputs(
			ends,
			[
				{ kind: "undo" },
				pick("start"),
				pick("target"),
				pick("other-league"),
				pick("a"),
				pick("a"),
			],
			{ ...checks, inLeague: (id) => id !== "other-league" },
		)
		expect(moves).toEqual([{ kind: "add", playerId: "a", connects: false }])
	})
})

describe("hints", () => {
	it("gives clues about one mystery teammate until the chain changes", () => {
		const moves = judgeChainInputs(ends, [hint, hint, pick("a")], checks)
		expect(moves).toEqual([
			{ kind: "hint", playerId: "a" },
			{ kind: "hint", playerId: "a" },
			{ kind: "add", playerId: "a", connects: false },
		])
		const twoClues = evaluateChainMoves(moves.slice(0, 2))
		expect(twoClues).toMatchObject({
			hints: 2,
			mystery: { playerId: "a", clues: 2 },
		})
		expect(evaluateChainMoves(moves)).toMatchObject({
			hints: 2,
			mystery: null,
		})
	})

	it("refuses a hint at a dead end, and past the last clue", () => {
		const atB = evaluateChainMoves([
			{ kind: "add", playerId: "c", connects: false },
		])
		expect(refuseChainInput(ends, atB, hint, checks)).toBe("dead_end")
		const allClues = evaluateChainMoves(
			Array.from({ length: CHAIN_CLUE_COUNT }, () => ({
				kind: "hint" as const,
				playerId: "a",
			})),
		)
		expect(refuseChainInput(ends, allClues, hint, checks)).toBe("out_of_clues")
	})

	it("costs a point each and shows in the result code", () => {
		const helped = evaluateChainMoves([
			{ kind: "hint", playerId: "a" },
			{ kind: "add", playerId: "a", connects: false },
			{ kind: "add", playerId: "b", connects: true },
		])
		expect(chainDayPoints(helped, 3)).toBe(5)
		expect(chainResultCode(helped, 30)).toBe("3-0-1-30")
	})
})

describe("refuseChainInput", () => {
	it("won't add past the chain's limit", () => {
		const full = evaluateChainMoves(
			Array.from({ length: CHAIN_MAX_MIDDLE }, (_, i) => ({
				kind: "add" as const,
				playerId: `p${i}`,
				connects: false,
			})),
		)
		expect(refuseChainInput(ends, full, pick("next"), checks)).toBe(
			"chain_full",
		)
		expect(refuseChainInput(ends, full, { kind: "undo" }, checks)).toBeNull()
	})

	it("refuses an undo with nothing to take back, and anything once it's over", () => {
		expect(
			refuseChainInput(ends, evaluateChainMoves([]), { kind: "undo" }, checks),
		).toBe("nothing_to_undo")
		const over = evaluateChainMoves([{ kind: "give_up" }])
		expect(refuseChainInput(ends, over, pick("a"), checks)).toBe("finished")
	})
})

describe("result codes and points", () => {
	const solved = evaluateChainMoves([
		{ kind: "miss", playerId: "x" },
		{ kind: "add", playerId: "a", connects: false },
		{ kind: "add", playerId: "b", connects: true },
	])

	it("round-trips a solved game and a game given up", () => {
		expect(chainResultCode(solved, 94)).toBe("3-1-0-94")
		expect(parseChainResultCode("3-1-2-94")).toEqual({
			solved: true,
			links: 3,
			misses: 1,
			hints: 2,
			seconds: 94,
		})
		const gaveUp = evaluateChainMoves([
			{ kind: "miss", playerId: "x" },
			{ kind: "give_up" },
		])
		expect(chainResultCode(gaveUp, 10)).toBe("x-1-0")
		expect(parseChainResultCode("x-1-3")).toEqual({
			solved: false,
			misses: 1,
			hints: 3,
		})
	})

	it("has no code for a game still going and rejects nonsense", () => {
		expect(chainResultCode(evaluateChainMoves([]), null)).toBeNull()
		expect(parseChainResultCode("9-0-0-10")).toBeNull()
		expect(parseChainResultCode("1-0-0-10")).toBeNull()
		expect(parseChainResultCode("3-1-94")).toBeNull()
		expect(parseChainResultCode("ggg")).toBeNull()
	})

	it("gives 6 at par, a point less per link over, at least 1 for a solve", () => {
		expect(chainDayPoints(solved, 3)).toBe(6)
		expect(chainDayPoints(solved, 2)).toBe(5)
		const long = evaluateChainMoves(
			["a", "b", "c", "d", "e"].map((playerId, i) => ({
				kind: "add" as const,
				playerId,
				connects: i === 4,
			})),
		)
		expect(chainDayPoints(long, 0)).toBe(1)
		expect(chainDayPoints(evaluateChainMoves([{ kind: "give_up" }]), 3)).toBe(0)
		expect(chainDayPoints(null, 3)).toBe(0)
	})
})

// start and a on CHI 1990, a and b on BOS 1995, b and target on LAL 2000.
// A second route: start and c on NYK 1992, c and b on BOS 1996.
const rows = [
	{ playerId: "start", teamId: "CHI", season: 1990 },
	{ playerId: "a", teamId: "CHI", season: 1990 },
	{ playerId: "a", teamId: "BOS", season: 1995 },
	{ playerId: "b", teamId: "BOS", season: 1995 },
	{ playerId: "b", teamId: "LAL", season: 2000 },
	{ playerId: "target", teamId: "LAL", season: 2000 },
	{ playerId: "start", teamId: "NYK", season: 1992 },
	{ playerId: "c", teamId: "NYK", season: 1992 },
	{ playerId: "c", teamId: "BOS", season: 1996 },
	{ playerId: "b", teamId: "BOS", season: 1996 },
	// Same franchise, different seasons: never teammates.
	{ playerId: "start", teamId: "LAL", season: 1999 },
]
const score = (id: string) => (id === "c" ? 10 : 1)

describe("league graph", () => {
	const graph = buildLeagueGraph(rows)

	it("counts links through shared team-seasons only", () => {
		const distance = linkDistances(graph, "start", 5)
		expect(distance.get("a")).toBe(1)
		expect(distance.get("b")).toBe(2)
		expect(distance.get("target")).toBe(3)
	})

	it("finds par, every player on a par route, and a par route through the best-known", () => {
		const routes = chainRoutes(graph, "start", "target", 4, score)
		expect(routes?.par).toBe(3)
		expect([...(routes?.routePlayers ?? [])].sort()).toEqual(["a", "b", "c"])
		expect(routes?.parRoute).toEqual(["c", "b"])
	})

	it("builds a puzzle in par range with enough routes, never a pair already used", () => {
		const rules = { minPar: 3, maxPar: 3, minRoutePlayers: 3 }
		const built = buildChainPuzzle(
			graph,
			["start", "target"],
			rules,
			new Set(),
			new Set(),
			score,
		)
		expect(built).toMatchObject({ par: 3, signature: "start:target" })
		expect(
			buildChainPuzzle(
				graph,
				["start", "target"],
				rules,
				new Set([chainSignature("target", "start")]),
				new Set(),
				score,
			),
		).toBeNull()
		expect(
			buildChainPuzzle(
				graph,
				["start", "target"],
				{ ...rules, minRoutePlayers: 4 },
				new Set(),
				new Set(),
				score,
			),
		).toBeNull()
	})
})

describe("help", () => {
	const graph = buildLeagueGraph(rows)
	const toTarget = distancesToTarget(graph, "target")

	it("flags a chain that can't reach the target in the links left", () => {
		const atA = evaluateChainMoves([
			{ kind: "add", playerId: "a", connects: false },
		])
		expect(linksLeft(atA)).toBe(CHAIN_MAX_MIDDLE)
		expect(isDeadEnd(ends, atA, toTarget)).toBe(false)
		// Five players in, ending two links from the target with one left.
		const deep = evaluateChainMoves(
			["p1", "p2", "p3", "p4", "a"].map((playerId) => ({
				kind: "add" as const,
				playerId,
				connects: false,
			})),
		)
		expect(isDeadEnd(ends, deep, toTarget)).toBe(true)
		expect(isDeadEnd(ends, evaluateChainMoves([]), toTarget)).toBe(false)
	})

	it("follows the par route while the chain is on it, then the shortest route from where it is", () => {
		const puzzle = { ...ends, parRoute: ["c", "b"] }
		const pick = (chain: string[]) =>
			pickMystery(
				graph,
				puzzle,
				evaluateChainMoves(
					chain.map((playerId) => ({
						kind: "add" as const,
						playerId,
						connects: false,
					})),
				),
				toTarget,
				score,
			)
		// On the par route: its next player, though "a" is just as short.
		expect(pick([])).toBe("c")
		expect(pick(["c"])).toBe("b")
		// Off it: the shortest way on from "a".
		expect(pick(["a"])).toBe("b")
	})
})

describe("mystery clues", () => {
	it("go from where to look to his initials", () => {
		expect(
			mysteryClues("nba", "NBA", {
				shared: { teamName: "Houston Rockets", season: 1999 },
				currentTeam: null,
				positions: ["SF", "PF"],
				firstSeason: 1988,
				lastSeason: 2004,
				draft: { year: 1987, round: 1, overall: 5 },
				hallOfFame: true,
				name: "Scottie Pippen",
			}),
		).toEqual([
			"Look at the 1998-99 Houston Rockets.",
			"Position: Small forward, Power forward. Played from 1988 to 2004.",
			"Drafted in 1987, round 1, pick 5 overall. A Hall of Famer.",
			"Initials: S. P.",
		])
	})

	it("skips suffixes in initials", () => {
		expect(initials("Ken Griffey Jr.")).toBe("K. G.")
	})
})

describe("schedule", () => {
	const scheduled = [
		{
			day: "2026-10-20",
			leagueId: "nba",
			startPlayerId: "s1",
			targetPlayerId: "t1",
		},
		{
			day: "2026-10-21",
			leagueId: "nfl",
			startPlayerId: "s2",
			targetPlayerId: "t2",
		},
	]

	it("tries the league that ran longest ago first, never yesterday's", () => {
		expect(
			chainLeagueOrder("2026-10-22", scheduled, ["nba", "nfl", "mlb"]),
		).toEqual(["mlb", "nba", "nfl"])
	})

	it("rests ends that ran within the rest window", () => {
		expect([...restingPlayers(scheduled, "2026-11-10")].sort()).toEqual([
			"s1",
			"s2",
			"t1",
			"t2",
		])
		expect(restingPlayers(scheduled, "2027-01-10").size).toBe(0)
	})
})

describe("chainStats", () => {
	it("counts solves at par, average over par, best time and streaks", () => {
		const stats = chainStats(
			[
				{ day: "2026-10-20", par: 3, links: 3, seconds: 90 },
				{ day: "2026-10-21", par: 3, links: 5, seconds: 60 },
				{ day: "2026-10-22", par: 4, links: null, seconds: null },
			],
			"2026-10-22",
		)
		expect(stats).toEqual({
			played: 3,
			solved: 2,
			atPar: 1,
			averageOverPar: 1,
			bestSeconds: 60,
			currentStreak: 3,
			bestStreak: 3,
		})
	})
})

describe("compactYears", () => {
	it("shortens runs within a century and keeps gaps", () => {
		expect(compactYears([1988, 1989, 1990, 1998])).toBe("1988-90, 1998")
		expect(compactYears([1999, 2000, 2001])).toBe("1999-2001")
	})
})

describe("sharedSeasonsLabel", () => {
	it("collapses runs and labels split seasons", () => {
		expect(sharedSeasonsLabel("nba", [1996, 1997, 1998])).toBe(
			"1995-96 to 1997-98",
		)
		expect(sharedSeasonsLabel("mlb", [2004, 2006, 2007])).toBe(
			"2004, 2006 to 2007",
		)
	})
})

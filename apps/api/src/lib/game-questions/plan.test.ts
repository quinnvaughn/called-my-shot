import { describe, expect, it, vi } from "vitest"
import type { GameQuestionTemplate } from "../../db/catalog/game-question-catalog"
import { HOUR_MS } from "../time"
import type { StarterCandidate, StarterPick } from "./pick-subjects"
import {
	gamesInWindow,
	isRuledOut,
	isStale,
	rosterCandidates,
	subjectPlayerIds,
	systemTemplates,
	windowFor,
} from "./plan"

const NOW = new Date("2026-11-10T16:00:00Z")
const hoursFromNow = (hours: number) =>
	new Date(NOW.getTime() + hours * HOUR_MS)

const GUARD: StarterPick = {
	role: "starter",
	positions: ["PG", "SG"],
	espnStat: "offensive.points",
	priorWeight: 10,
}

const POINTS_LINE: GameQuestionTemplate = {
	id: "points-line",
	tier: 1,
	shape: "player_stat_over_under",
	statName: "Points",
	group: "points",
	pick: GUARD,
	line: { minGames: 8, shade: 1, minLine: 0.5 },
}
const POINTS_DUEL: GameQuestionTemplate = {
	id: "points-duel",
	tier: 1,
	shape: "player_vs_player",
	statName: "Points",
	group: "points",
	pick: GUARD,
}
const POINTS_LEADER: GameQuestionTemplate = {
	id: "points-leader",
	tier: 1,
	shape: "player_game_stat_leader",
	statName: "Points",
	group: "points",
	pick: GUARD,
}
const TEAM_POINTS: GameQuestionTemplate = {
	id: "team-points",
	tier: 1,
	shape: "team_stat_numeric_guess",
	statName: "Points",
}

const starter = (
	playerId: string,
	teamId: string,
	overrides: Partial<StarterCandidate> = {},
): StarterCandidate => ({
	playerId,
	teamId,
	role: "starter",
	position: "PG",
	sortOrder: 1,
	injuryStatus: null,
	...overrides,
})

describe("windowFor", () => {
	it("takes a day ahead for daily leagues, the week for the NFL", () => {
		expect(windowFor("nba")).toEqual({ kind: "ahead", ms: 30 * HOUR_MS })
		expect(windowFor("mlb")).toEqual({ kind: "ahead", ms: 30 * HOUR_MS })
		expect(windowFor("nfl")).toEqual({ kind: "week" })
		expect(windowFor("wnba")).toBeNull()
	})
})

describe("gamesInWindow", () => {
	const nflGame = (hours: number, weekNumber: number | null) => ({
		startsAt: hoursFromNow(hours),
		seasonId: "season",
		seasonType: "regular" as const,
		weekNumber,
	})

	it("takes the whole week the next NFL game belongs to", () => {
		const thursday = nflGame(2, 3)
		const sunday = nflGame(74, 3)
		const nextWeek = nflGame(170, 4)
		expect(
			gamesInWindow([nextWeek, sunday, thursday], { kind: "week" }, NOW),
		).toEqual([thursday, sunday])
	})

	it("leaves out a game about to start", () => {
		const aboutToStart = nflGame(0.5, 3)
		const later = nflGame(3, 3)
		expect(gamesInWindow([aboutToStart, later], { kind: "week" }, NOW)).toEqual(
			[later],
		)
	})

	it("takes the hours ahead for a daily league", () => {
		const tonight = nflGame(10, null)
		const dayAfter = nflGame(40, null)
		expect(
			gamesInWindow(
				[dayAfter, tonight],
				{ kind: "ahead", ms: 30 * HOUR_MS },
				NOW,
			),
		).toEqual([tonight])
	})
})

describe("systemTemplates", () => {
	it("keeps only templates whose stat settles from ESPN", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const unknownStat = { ...POINTS_LINE, id: "hustle", statName: "Hustle" }
		const stats = new Map([["Points", { toleranceTier: null }]])

		expect(
			systemTemplates("nba", [POINTS_LINE, unknownStat], stats).map(
				(t) => t.id,
			),
		).toEqual(["points-line"])
		expect(error).toHaveBeenCalledOnce()
		error.mockRestore()
	})

	it("drops a numeric guess whose stat has no tolerance tier to grade it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {})
		const tiered = new Map([["Points", { toleranceTier: { id: "tier" } }]])
		const untiered = new Map([["Points", { toleranceTier: null }]])

		expect(systemTemplates("nba", [TEAM_POINTS], tiered)).toEqual([TEAM_POINTS])
		expect(systemTemplates("nba", [TEAM_POINTS], untiered)).toEqual([])
		error.mockRestore()
	})
})

describe("rosterCandidates", () => {
	it("shapes the roster players at the pick's positions like starters", () => {
		const roster = [
			{ id: "guard", position: "PG", positions: ["PG"] },
			{ id: "center", position: "C", positions: ["C"] },
			{ id: "swing", position: "SF", positions: ["SF", "SG"] },
		]
		expect(rosterCandidates(roster, "team", GUARD)).toEqual([
			starter("guard", "team", { sortOrder: 1 }),
			starter("swing", "team", { position: "SF", sortOrder: 2 }),
		])
	})

	it("takes the whole roster when the pick names no positions", () => {
		const roster = [{ id: "center", position: "C", positions: ["C"] }]
		const anyone = { ...GUARD, positions: undefined }
		expect(
			rosterCandidates(roster, "team", anyone).map((c) => c.playerId),
		).toEqual(["center"])
	})
})

describe("isRuledOut", () => {
	it("can't rule anyone out before the team's starters are posted", () => {
		expect(isRuledOut([], "team", "player", GUARD)).toBe(false)
	})

	it("rules out a player missing from the posted starters", () => {
		const posted = [starter("other", "team")]
		expect(isRuledOut(posted, "team", "player", GUARD)).toBe(true)
		expect(isRuledOut(posted, "team", "other", GUARD)).toBe(false)
	})

	it("rules out a listed starter who can't play", () => {
		const posted = [starter("player", "team", { injuryStatus: "Out" })]
		expect(isRuledOut(posted, "team", "player", GUARD)).toBe(true)
	})
})

describe("isStale", () => {
	const game = { awayTeamId: "away", homeTeamId: "home" }
	const posted = [starter("a1", "away"), starter("h1", "home")]

	it("marks an over/under on a player no longer starting", () => {
		expect(isStale(POINTS_LINE, ["away", "a2"], posted, game)).toBe(true)
		expect(isStale(POINTS_LINE, ["away", "a1"], posted, game)).toBe(false)
	})

	it("marks a duel when either side's player is out", () => {
		expect(isStale(POINTS_DUEL, ["a1", "h2"], posted, game)).toBe(true)
		expect(isStale(POINTS_DUEL, ["a1", "h1"], posted, game)).toBe(false)
	})

	it("never marks a question that isn't about one player", () => {
		expect(isStale(POINTS_LEADER, [], posted, game)).toBe(false)
		expect(isStale(TEAM_POINTS, ["away"], posted, game)).toBe(false)
	})
})

describe("subjectPlayerIds", () => {
	it("reads the players off the rest of the key", () => {
		expect(subjectPlayerIds(POINTS_DUEL, ["a1", "h1"])).toEqual(["a1", "h1"])
		expect(subjectPlayerIds(POINTS_LINE, ["away", "a1"])).toEqual(["a1"])
		expect(subjectPlayerIds(POINTS_LEADER, [])).toEqual([])
		expect(subjectPlayerIds(TEAM_POINTS, ["away"])).toEqual([])
	})
})

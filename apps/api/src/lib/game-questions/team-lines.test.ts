import { describe, expect, it } from "vitest"
import {
	HOME_EDGE_WEIGHT,
	homeEdge,
	sampleOf,
	scoresByTeam,
	seasonTable,
} from "./team-lines"

const game = (
	homeTeamId: string,
	awayTeamId: string,
	homeScore: number | null,
	awayScore: number | null,
) => ({ homeTeamId, awayTeamId, homeScore, awayScore })

describe("scoresByTeam", () => {
	it("takes each side's own score off both sides of a game", () => {
		const scores = scoresByTeam([game("bos", "nyk", 112, 104)])
		expect(scores.get("bos")).toEqual([112])
		expect(scores.get("nyk")).toEqual([104])
	})

	it("collects a team's scores across games, home and away", () => {
		const scores = scoresByTeam([
			game("bos", "nyk", 112, 104),
			game("mia", "bos", 98, 120),
		])
		expect(scores.get("bos")).toEqual([112, 120])
	})

	it("skips a game missing either score", () => {
		const scores = scoresByTeam([
			game("bos", "nyk", 112, null),
			game("bos", "mia", null, 99),
			game("bos", "phi", 108, 101),
		])
		expect(scores.get("bos")).toEqual([108])
	})
})

describe("sampleOf", () => {
	it("averages the scores it's given", () => {
		expect(sampleOf([110, 120, 100])).toEqual({ mean: 110, games: 3 })
	})

	it("is null with nothing to average", () => {
		expect(sampleOf([])).toBeNull()
		expect(sampleOf(undefined)).toBeNull()
	})
})

describe("homeEdge", () => {
	it("is no edge at all with nothing played", () => {
		expect(homeEdge(seasonTable([]))).toEqual({ home: 1, away: 1 })
	})

	it("regresses a season's measured edge toward none", () => {
		// Home sides score 110 to the away sides' 90, a 10% edge either way
		// off the league's 100, over HOME_EDGE_WEIGHT games: trusted halfway.
		const finals = Array.from({ length: HOME_EDGE_WEIGHT }, () =>
			game("home", "away", 110, 90),
		)
		const edge = homeEdge(seasonTable(finals))
		expect(edge.home).toBeCloseTo(1.05, 10)
		expect(edge.away).toBeCloseTo(0.95, 10)
	})
})

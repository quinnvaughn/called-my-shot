import { describe, expect, it } from "vitest"
import { sampleOf, scoresByTeam } from "./team-lines"

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

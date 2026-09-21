import { describe, expect, it } from "vitest"
import {
	chooseFrom,
	eligibleStarters,
	isPlayable,
	rankCandidates,
	type StarterCandidate,
	startersPosted,
} from "./pick-subjects"

const starter = (overrides: Partial<StarterCandidate>): StarterCandidate => ({
	playerId: "qb1",
	teamId: "home",
	role: "offense",
	position: "QB",
	sortOrder: 1,
	injuryStatus: null,
	...overrides,
})

const QB_PICK = { role: "offense" as const, positions: ["QB"] }

describe("isPlayable", () => {
	it("allows a healthy or listed-as-likely player", () => {
		expect(isPlayable(null)).toBe(true)
		expect(isPlayable("Questionable")).toBe(true)
		expect(isPlayable("Day-To-Day")).toBe(true)
	})

	it("rules out anyone listed as unlikely to play, or listed as anything unknown", () => {
		expect(isPlayable("Out")).toBe(false)
		expect(isPlayable("Doubtful")).toBe(false)
		expect(isPlayable("Injured Reserve")).toBe(false)
		expect(isPlayable("Something New")).toBe(false)
	})
})

describe("eligibleStarters", () => {
	it("keeps the team's playable starters at the pick's positions, in depth chart order", () => {
		const starters = [
			starter({ playerId: "rb", position: "RB", sortOrder: 2 }),
			starter({ playerId: "qb-late", sortOrder: 9 }),
			starter({ playerId: "qb-hurt", sortOrder: 3, injuryStatus: "Out" }),
			starter({ playerId: "qb-away", teamId: "away" }),
			starter({ playerId: "qb-defense", role: "defense" }),
			starter({ playerId: "qb", sortOrder: 1 }),
		]
		expect(
			eligibleStarters(starters, "home", QB_PICK).map((s) => s.playerId),
		).toEqual(["qb", "qb-late"])
	})

	it("takes any position when the pick names none", () => {
		const starters = [
			starter({ playerId: "c", role: "starter", position: "C", sortOrder: 5 }),
			starter({
				playerId: "pg",
				role: "starter",
				position: "PG",
				sortOrder: 1,
			}),
		]
		expect(
			eligibleStarters(starters, "home", { role: "starter" }).map(
				(s) => s.playerId,
			),
		).toEqual(["pg", "c"])
	})
})

describe("startersPosted", () => {
	it("is true once the team has anyone listed in the role, playable or not", () => {
		const starters = [starter({ injuryStatus: "Out" })]
		expect(startersPosted(starters, "home", "offense")).toBe(true)
		expect(startersPosted(starters, "home", "defense")).toBe(false)
		expect(startersPosted(starters, "away", "offense")).toBe(false)
	})
})

describe("chooseFrom", () => {
	const ranked = ["best", "second", "third", "fourth"]

	it("takes the best when choose is unset or there's only one", () => {
		expect(chooseFrom(ranked, undefined, "seed")).toBe("best")
		expect(chooseFrom(["only"], 3, "seed")).toBe("only")
		expect(chooseFrom([], 3, "seed")).toBeUndefined()
	})

	it("draws from the top few, the same one for the same seed", () => {
		const picks = Array.from({ length: 30 }, (_, i) =>
			chooseFrom(ranked, 3, `game-${i}`),
		)
		expect(new Set(picks).size).toBeGreaterThan(1)
		expect(picks).not.toContain("fourth")
		expect(chooseFrom(ranked, 3, "game-1")).toBe(
			chooseFrom(ranked, 3, "game-1"),
		)
	})
})

describe("rankCandidates", () => {
	it("puts the highest average first and anyone without one last, in depth order", () => {
		const candidates = [
			starter({ playerId: "none-1" }),
			starter({ playerId: "low" }),
			starter({ playerId: "none-2" }),
			starter({ playerId: "high" }),
		]
		const averages: Record<string, number | null> = {
			"none-1": null,
			low: 10,
			"none-2": null,
			high: 25,
		}
		expect(
			rankCandidates(candidates, (c) => averages[c.playerId] ?? null).map(
				(c) => c.playerId,
			),
		).toEqual(["high", "low", "none-1", "none-2"])
	})

	it("breaks a tie by depth chart order", () => {
		const candidates = [
			starter({ playerId: "first" }),
			starter({ playerId: "second" }),
		]
		expect(rankCandidates(candidates, () => 20).map((c) => c.playerId)).toEqual(
			["first", "second"],
		)
	})
})

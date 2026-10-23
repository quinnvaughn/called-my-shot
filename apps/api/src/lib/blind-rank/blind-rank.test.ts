import { describe, expect, it } from "vitest"
import {
	careerStatPuzzle,
	franchisePuzzle,
	pickFive,
	seasonStatPuzzle,
	teamSeasonPuzzle,
} from "./generate"
import {
	evaluateRankPlacements,
	legalRankPlacements,
	parseRankSquaresCode,
	rankSquaresCode,
	refuseRankPlacement,
	trueSlotsOf,
} from "./play"
import { PLAYER_RANK_STATS } from "./rank-stats"
import { planRankSlots } from "./schedule"
import { rankStats } from "./stats"

// A seeded random, so a test's picks don't change run to run.
function seeded(seed = 1) {
	let s = seed
	return () => {
		s = (s * 16807) % 2147483647
		return (s - 1) / 2147483646
	}
}

const candidate = (key: string, value: number) => ({
	key,
	label: key,
	sublabel: null,
	teamId: null,
	value,
	display: String(value),
})

describe("pickFive", () => {
	it("picks five with no two values within 2% of each other", () => {
		const pool = [100, 101, 99, 200, 300, 301, 400, 500, 600].map((v) =>
			candidate(String(v), v),
		)
		const picked = pickFive(pool, seeded())
		expect(picked).toHaveLength(5)
		const values = (picked ?? []).map((p) => p.value).sort((a, b) => a - b)
		for (let i = 1; i < values.length; i++) {
			const a = values[i - 1] ?? 0
			const b = values[i] ?? 0
			expect(b - a).toBeGreaterThanOrEqual(0.02 * b)
		}
	})

	it("is null when the pool can't give five", () => {
		const pool = [10, 10, 10.1, 20, 30].map((v, i) => candidate(String(i), v))
		expect(pickFive(pool, seeded())).toBeNull()
	})
})

describe("generators", () => {
	const passing = PLAYER_RANK_STATS.nfl[0]
	if (!passing) throw new Error("no NFL passing stat")

	it("words a season prompt and keeps the stat-and-season signature", () => {
		const leaders = [4806, 4423, 4155, 3966, 3600, 3300].map((v, i) => ({
			espnAthleteId: String(i),
			athlete: `QB ${i}`,
			teamId: null,
			teamName: "Team",
			value: v,
		}))
		const puzzle = seasonStatPuzzle("nfl", passing, 2007, leaders, seeded())
		expect(puzzle?.prompt).toBe("Passing yards")
		expect(puzzle?.context).toBe("2007 NFL season")
		expect(puzzle?.signature).toBe("season_stat:nfl:passingYards:2007")
		expect(puzzle?.items).toHaveLength(5)
		expect(puzzle?.items[0]?.display).toMatch(/^\d,\d{3}$/)
	})

	it("draws a career prompt from the stat's career leaders only", () => {
		const careers = Array.from({ length: 60 }, (_, i) => ({
			espnAthleteId: String(i),
			athlete: `QB ${i}`,
			teamId: null,
			stats: { "passing.passingYards": 100_000 - i * 1000 },
		}))
		const puzzle = careerStatPuzzle(
			"nfl",
			passing,
			careers,
			new Map(),
			seeded(),
		)
		expect(puzzle?.prompt).toBe("Career passing yards")
		for (const item of puzzle?.items ?? []) {
			expect(item.value).toBeGreaterThan(100_000 - 40 * 1000)
		}
	})

	it("ranks NBA team scoring per game and skips seasons with no totals", () => {
		const seasons = [
			[60, 22, 8571],
			[55, 27, 8200],
			[47, 35, 7900],
			[42, 40, 7600],
			[30, 52, 7300],
			[25, 57, 0],
		].map(([wins, losses, pointsFor], i) => ({
			teamId: String(i),
			name: `Team ${i}`,
			wins: wins ?? 0,
			losses: losses ?? 0,
			ties: 0,
			otLosses: 0,
			pointsFor: pointsFor ?? 0,
			pointsAgainst: 0,
		}))
		const puzzle = teamSeasonPuzzle("nba", "pointsFor", 1996, seasons, seeded())
		expect(puzzle?.prompt).toBe("Points scored per game")
		expect(puzzle?.items.map((i) => i.label)).not.toContain("Team 5")
	})

	it("counts franchise titles across the archive", () => {
		// Six franchises across 1985-1994, with 0 to 5 titles between them.
		const titles: Record<string, number> = {
			a: 0,
			b: 1,
			c: 2,
			d: 3,
			e: 4,
			f: 5,
		}
		let champion = 0
		const seasons = Object.keys(titles).flatMap((teamId) =>
			Array.from({ length: 10 }, (_, y) => ({
				teamId,
				year: 1985 + y,
				outcome: "missed",
			})),
		)
		for (const [teamId, count] of Object.entries(titles)) {
			for (let n = 0; n < count; n++) {
				const season = seasons.find(
					(s) => s.teamId === teamId && s.year === 1985 + ((champion + n) % 10),
				)
				if (season) season.outcome = "champion"
			}
			champion += count
		}
		const names = new Map(Object.keys(titles).map((t) => [t, `F ${t}`]))
		const puzzle = franchisePuzzle("nhl", "titles", seasons, names, seeded())
		expect(puzzle?.context).toBe("NHL since 1984-85")
		expect(puzzle?.items).toHaveLength(5)
	})
})

const items = [30, 10, 50, 20, 40].map((value) => ({ value }))

describe("evaluateRankPlacements", () => {
	it("ranks highest first", () => {
		expect(trueSlotsOf(items)).toEqual([2, 4, 0, 3, 1])
	})

	it("holds back everything but the next item until all five are placed", () => {
		const state = evaluateRankPlacements(items, [2, 4])
		expect(state.nextIndex).toBe(2)
		expect(state.done).toBe(false)
		expect(state.correct).toBeNull()
	})

	it("scores each slot once done", () => {
		const state = evaluateRankPlacements(items, [2, 4, 0, 1, 3])
		expect(state.correct).toEqual([true, true, true, false, false])
		expect(state.correctCount).toBe(3)
		// By slot from the top: items 2, 3, 0, 4, 1 sit in slots 0 to 4.
		expect(rankSquaresCode(state)).toBe("grgrg")
	})
})

describe("refuseRankPlacement", () => {
	it("refuses a taken slot, one out of range, and anything after five", () => {
		expect(refuseRankPlacement(items, [0], 0)).toBe("taken")
		expect(refuseRankPlacement(items, [], 5)).toBe("invalid_slot")
		expect(refuseRankPlacement(items, [0, 1, 2, 3, 4], 0)).toBe("finished")
		expect(refuseRankPlacement(items, [0], 1)).toBeNull()
	})

	it("drops placements a guest couldn't have made", () => {
		expect(legalRankPlacements(items, [0, 0, 9, 1])).toEqual([0, 1])
	})
})

describe("parseRankSquaresCode", () => {
	it("reads five squares and refuses four right", () => {
		expect(parseRankSquaresCode("ggrgr")).toEqual([
			true,
			true,
			false,
			true,
			false,
		])
		expect(parseRankSquaresCode("ggggr")).toBeNull()
		expect(parseRankSquaresCode("ggg")).toBeNull()
	})
})

describe("planRankSlots", () => {
	it("takes turns by league and by kind", () => {
		const plan = planRankSlots(
			"2026-10-20",
			[{ day: "2026-10-19", leagueId: "nba", kind: "season_stat" }],
			["nba", "nfl", "mlb"],
		)
		expect(plan.slice(0, 3).map((p) => p.leagueId)).toEqual([
			"mlb",
			"nfl",
			"nba",
		])
		expect(plan[0]?.kinds[0]).not.toBe("season_stat")
		expect(plan[1]?.kinds[0]).not.toBe(plan[0]?.kinds[0])
	})
})

describe("franchise tenure", () => {
	it("leaves out a franchise that hasn't been around most of the span", () => {
		const seasons = ["a", "b", "c", "d", "e"].flatMap((teamId, t) =>
			Array.from({ length: 10 }, (_, y) => ({
				teamId,
				year: 2000 + y,
				outcome: y < t ? "champion" : "missed",
			})),
		)
		const newcomer = { teamId: "new", year: 2009, outcome: "champion" }
		const names = new Map(
			["a", "b", "c", "d", "e", "new"].map((t) => [t, `F ${t}`]),
		)
		const puzzle = franchisePuzzle(
			"nhl",
			"titles",
			[...seasons, newcomer],
			names,
			seeded(),
		)
		expect(puzzle?.items.map((i) => i.label)).not.toContain("F new")
	})
})

describe("planRankSlots kinds", () => {
	it("cycles each league through the kinds on its own", () => {
		const plan = planRankSlots("2026-10-20", [], ["mlb", "nba", "nfl", "nhl"])
		const nbaKinds = plan
			.filter((p) => p.leagueId === "nba")
			.map((p) => p.kinds[0])
		expect(new Set(nbaKinds.slice(0, 3)).size).toBe(3)
	})
})

describe("rankStats", () => {
	it("counts the distribution, perfect games and streaks", () => {
		const stats = rankStats(
			[
				{ day: "2026-10-18", correctCount: 5 },
				{ day: "2026-10-19", correctCount: 2 },
			],
			"2026-10-20",
		)
		expect(stats.distribution).toEqual([0, 0, 1, 0, 0, 1])
		expect(stats.perfect).toBe(1)
		expect(stats.currentStreak).toBe(2)
	})
})

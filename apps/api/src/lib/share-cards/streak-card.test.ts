import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import {
	buildStreakShareCard,
	parseStreakFamily,
	streakHero,
} from "./streak-card"

// Fixed 1200x630 like call-card.ts, with the same silent-clipping hazard: the
// caps on free text are what keep a long pick or title off the footer.

const base = {
	leagueAbbr: "NFL",
	familyLabel: "Player Stats",
	name: "Quinn Vaughn",
	username: "quinn",
	mode: "hot" as const,
	currentLength: 7,
	bestLength: 9,
	currentColdLength: 0,
	worstColdLength: 2,
	runStartedAt: "Sep 3, 2026",
	lastCall: {
		pickLabel: "Over 275.5",
		questionTitle: "KC @ BUF · Mahomes passing yards",
	},
}

const MAX_TEXT_LENGTH = 200

describe("buildStreakShareCard", () => {
	it("leads with the current run and states every cell", () => {
		const texts = textNodes(buildStreakShareCard(base))
		expect(texts).toContain("7 in a row")
		expect(texts).toContain("Current")
		expect(texts).toContain("7")
		expect(texts).toContain("NFL · Player Stats streak")
		expect(texts).toContain("Best")
		expect(texts).toContain("9")
		expect(texts).toContain("Run started")
		expect(texts).toContain("Sep 3, 2026")
		expect(texts).toContain("Last hit")
		expect(texts).toContain("Over 275.5")
		expect(texts).toContain("@quinn")
		expect(texts).toContain("NFL Player Stats calls right")
	})

	it("leads with the best run once the current one has ended", () => {
		const texts = textNodes(buildStreakShareCard({ ...base, currentLength: 0 }))
		expect(texts).toContain("9 in a row")
		expect(texts).not.toContain("0 in a row")
		expect(texts).toContain("Best run on NFL Player Stats")
	})

	it("states the cold run, and never a hot number, on a cold card", () => {
		const texts = textNodes(
			buildStreakShareCard({
				...base,
				mode: "cold",
				currentLength: 0,
				bestLength: 0,
				currentColdLength: 4,
				worstColdLength: 4,
			}),
		)
		expect(texts).toContain("4 misses in a row")
		expect(texts).toContain("NFL · Player Stats cold streak")
		expect(texts).toContain("Cold")
		expect(texts).toContain("Worst")
		expect(texts).toContain("Last miss")
		expect(texts).toContain("NFL Player Stats calls wrong")
		expect(texts).not.toContain("0 in a row")
		expect(texts).not.toContain("Best run on NFL Player Stats")
	})

	it("says one miss, not one misses", () => {
		const texts = textNodes(
			buildStreakShareCard({
				...base,
				mode: "cold",
				currentLength: 0,
				currentColdLength: 1,
				worstColdLength: 1,
			}),
		)
		expect(texts).toContain("1 miss in a row")
		expect(texts).toContain("NFL Player Stats call wrong")
	})

	it("caps a long last-hit pick and title", () => {
		const texts = textNodes(
			buildStreakShareCard({
				...base,
				lastCall: {
					pickLabel: "Minnesota Timberwolves to win the Western Conference",
					questionTitle:
						"Which player will record the most receiving yards ".repeat(5),
				},
			}),
		)
		for (const text of texts) {
			expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH)
		}
		expect(texts.some((t) => t.startsWith("Minnesota Timb"))).toBe(true)
	})
})

describe("streakHero", () => {
	it("is the run length while a run is going, the best otherwise", () => {
		expect(streakHero(base)).toBe("7 in a row")
		expect(streakHero({ ...base, currentLength: 0 })).toBe("9 in a row")
	})

	it("counts misses on a cold card", () => {
		const cold = { ...base, mode: "cold" as const, currentLength: 0 }
		expect(streakHero({ ...cold, currentColdLength: 4 })).toBe(
			"4 misses in a row",
		)
		// Falls back to the worst on record the same way the hot side falls
		// back to the best.
		expect(streakHero({ ...cold, currentColdLength: 0 })).toBe(
			"2 misses in a row",
		)
	})
})

describe("parseStreakFamily", () => {
	it("accepts only the lowercase url form of a family", () => {
		expect(parseStreakFamily("player_stats")).toBe("player_stats")
		expect(parseStreakFamily("PLAYER_STATS")).toBeNull()
		expect(parseStreakFamily("parlays")).toBeNull()
	})
})

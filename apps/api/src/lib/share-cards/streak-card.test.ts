import { describe, expect, it } from "vitest"
import type { SatoriNode } from "../share-image"
import {
	buildStreakShareCard,
	parseStreakFamily,
	STREAK_SHARE_CARD_SIZE,
	streakHero,
} from "./streak-card"

// Fixed 1200x630 like call-card.ts, with the same silent-clipping hazard: the
// caps on free text are what keep a long pick or title off the footer.

function textNodes(node: SatoriNode, out: string[] = []): string[] {
	const children = node.props.children
	if (typeof children === "string") {
		out.push(children)
	} else if (Array.isArray(children)) {
		for (const child of children as SatoriNode[]) {
			if (child && typeof child === "object") textNodes(child, out)
		}
	} else if (children && typeof children === "object") {
		textNodes(children as SatoriNode, out)
	}
	return out
}

const base = {
	leagueAbbr: "NFL",
	familyLabel: "Player Stats",
	name: "Quinn Vaughn",
	username: "quinn",
	currentLength: 7,
	bestLength: 9,
	runStartedAt: "Sep 3, 2026",
	lastHit: {
		pickLabel: "Over 275.5",
		questionTitle: "KC @ BUF · Mahomes passing yards",
	},
}

const MAX_TEXT_LENGTH = 200

describe("buildStreakShareCard", () => {
	it("renders at exactly the size X crops og:image to", () => {
		expect(STREAK_SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 })
	})

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

	it("caps a long last-hit pick and title", () => {
		const texts = textNodes(
			buildStreakShareCard({
				...base,
				lastHit: {
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
		expect(streakHero(7, 9)).toBe("7 in a row")
		expect(streakHero(0, 9)).toBe("9 in a row")
	})
})

describe("parseStreakFamily", () => {
	it("accepts only the lowercase url form of a family", () => {
		expect(parseStreakFamily("player_stats")).toBe("player_stats")
		expect(parseStreakFamily("PLAYER_STATS")).toBeNull()
		expect(parseStreakFamily("parlays")).toBeNull()
	})
})

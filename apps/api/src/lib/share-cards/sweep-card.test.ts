import { describe, expect, it } from "vitest"
import type { SatoriNode } from "../share-image"
import {
	buildSweepShareCard,
	formatSlateDates,
	SWEEP_SHARE_CARD_SIZE,
	type SweepGameChip,
} from "./sweep-card"

// Fixed 1200x630 like call-card.ts. The chip grid is the one part of this
// card whose size depends on the data, so what matters is that every game
// gets a chip however many the slate has.

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

function findAll(
	node: SatoriNode,
	pred: (n: SatoriNode) => boolean,
	out: SatoriNode[] = [],
): SatoriNode[] {
	if (pred(node)) out.push(node)
	const children = node.props.children
	if (Array.isArray(children)) {
		for (const child of children as SatoriNode[]) {
			if (child && typeof child === "object") findAll(child, pred, out)
		}
	} else if (children && typeof children === "object") {
		findAll(children as SatoriNode, pred, out)
	}
	return out
}

const games = (n: number): SweepGameChip[] =>
	Array.from({ length: n }, (_, i) => ({
		away: `A${i}`,
		home: `H${i}`,
		picked: i % 2 === 0 ? "away" : "home",
	}))

const base = {
	leagueAbbr: "NFL",
	slateLabel: "Week 3 Sunday Early",
	name: "Quinn Vaughn",
	username: "quinn",
	games: games(9),
	points: 240,
	dates: "Sep 20, 2026",
	multiDay: false,
}

describe("buildSweepShareCard", () => {
	it("renders at exactly the size X crops og:image to", () => {
		expect(SWEEP_SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 })
	})

	it("states the slate, the hero and every cell", () => {
		const texts = textNodes(buildSweepShareCard(base))
		expect(texts).toContain("NFL · Week 3 Sunday Early sweep")
		expect(texts).toContain("9 for 9")
		expect(texts).toContain("Games")
		expect(texts).toContain("Record")
		expect(texts).toContain("9–0")
		expect(texts).toContain("+240")
		expect(texts).toContain("Date")
		expect(texts).toContain("Sep 20, 2026")
	})

	it("gives all 15 games of a full MLB day a chip, none dropped", () => {
		const node = buildSweepShareCard({
			...base,
			leagueAbbr: "MLB",
			slateLabel: "Sep 14",
			games: games(15),
		})
		const texts = textNodes(node)
		expect(texts).toContain("15 for 15")
		for (let i = 0; i < 15; i++) {
			expect(texts).toContain(`A${i}`)
			expect(texts).toContain(`H${i}`)
		}
		const grid = findAll(node, (n) => n.props.style?.flexWrap === "wrap")
		expect(grid).toHaveLength(1)
		expect(grid[0]?.props.children).toHaveLength(15)
	})

	it("leaves out points until they are final", () => {
		const texts = textNodes(buildSweepShareCard({ ...base, points: null }))
		expect(texts).not.toContain("Points")
	})
})

describe("formatSlateDates", () => {
	it("states a single ET day", () => {
		expect(formatSlateDates([new Date("2026-09-20T17:00:00Z")])).toEqual({
			text: "Sep 20, 2026",
			multiDay: false,
		})
	})

	it("counts a late West Coast game as the ET day it started on", () => {
		expect(
			formatSlateDates([
				new Date("2026-09-14T23:00:00Z"),
				new Date("2026-09-15T02:10:00Z"),
			]),
		).toEqual({ text: "Sep 14, 2026", multiDay: false })
	})

	it("states a range across days and months", () => {
		expect(
			formatSlateDates([
				new Date("2026-10-01T17:00:00Z"),
				new Date("2026-09-30T17:00:00Z"),
			]),
		).toEqual({ text: "Sep 30 to Oct 1, 2026", multiDay: true })
	})
})

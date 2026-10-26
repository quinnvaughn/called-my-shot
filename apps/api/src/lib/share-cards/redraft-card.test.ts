import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import {
	buildRedraftCard,
	movePill,
	REDRAFT_SIZE,
	type RedraftCardData,
	type RedraftRow,
	shortName,
} from "./redraft-card"

// A 1x1 transparent PNG, standing in for a portrait and a logo.
const PIXEL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

const rowsOf = (n: number): RedraftRow[] =>
	Array.from({ length: n }, (_, i) => ({
		slot: i + 1,
		name: `Player Number${i + 1}`,
		portrait: PIXEL,
		teamLogo: PIXEL,
		original: i === 4 ? null : n - i,
	}))

const base: RedraftCardData = {
	title: "2003 NBA Draft",
	code: "nba-2003",
	color: "#1E2E40",
	rows: rowsOf(5),
	credit: { kind: "author", username: "quinn" },
}

const MAX_TEXT_LENGTH = 95

function circles(node: ReturnType<typeof buildRedraftCard>): number {
	let n = 0
	const walk = (child: unknown) => {
		if (!child || typeof child !== "object") return
		const props = (child as { props: Record<string, unknown> }).props
		const style = props.style as Record<string, unknown> | undefined
		if (style?.borderRadius === "50%") n++
		const children = props.children
		if (Array.isArray(children)) children.forEach(walk)
		else walk(children)
	}
	walk(node)
	return n
}

describe("buildRedraftCard", () => {
	it.each([
		["landscape", 1200, 630],
		["portrait", 1080, 1350],
	] as const)("renders the %s layout at %ix%i", (layout, width, height) => {
		expect(REDRAFT_SIZE[layout]).toEqual({ width, height })
		const node = buildRedraftCard(base, layout)
		expect(node.props.style?.width).toBe(`${width}px`)
		expect(node.props.style?.height).toBe(`${height}px`)
	})

	it("gives up to ten picks a portrait each, and packs a first round into two columns of names", () => {
		expect(
			circles(buildRedraftCard({ ...base, rows: rowsOf(10) }, "portrait")),
		).toBe(10)
		const firstRound = buildRedraftCard(
			{ ...base, rows: rowsOf(32) },
			"portrait",
		)
		expect(circles(firstRound)).toBe(0)
		const texts = textNodes(firstRound)
		expect(texts).toContain("32")
		expect(texts).toContain("P. Number32")
	})

	it("shows the first ten in the link preview and says how many more there are", () => {
		const texts = textNodes(
			buildRedraftCard(
				{
					...base,
					// In their real slots, so the pills carry no numbers.
					rows: rowsOf(14).map((row) => ({ ...row, original: row.slot })),
				},
				"landscape",
			),
		)
		expect(texts).toContain("10")
		expect(texts).not.toContain("11")
		expect(texts).toContain("+4 more")
	})

	it("says where each pick really went, bylines the author and counts the crowd", () => {
		const own = textNodes(buildRedraftCard(base, "portrait"))
		// Slot 1 really went 5th: up 4. Slot 5 came in undrafted.
		expect(own).toContain("4")
		expect(own).toContain("Undrafted")
		expect(own.some((t) => t.startsWith("was"))).toBe(false)
		expect(own).toContain("by @quinn")
		expect(own).toContain("calledmyshot.com/redraft/nba-2003/quinn")
		const crowd = textNodes(
			buildRedraftCard(
				{ ...base, credit: { kind: "crowd", answers: 1284 } },
				"landscape",
			),
		)
		expect(crowd).toContain("1,284 redrafts")
		expect(crowd).toContain("calledmyshot.com/redraft/nba-2003")
	})

	it.each([
		"landscape",
		"portrait",
	] as const)("caps every text node in the %s layout", (layout) => {
		const long = rowsOf(32).map((row) => ({
			...row,
			name: `${"Bartholomew ".repeat(4)}${"Wolfeschlegelsteinhausen".repeat(3)}`,
		}))
		for (const rows of [long.slice(0, 8), long]) {
			const node = buildRedraftCard(
				{
					...base,
					title: "A draft class with a title far too long ".repeat(4),
					code: "x".repeat(80),
					rows,
					credit: { kind: "author", username: "u".repeat(80) },
				},
				layout,
			)
			for (const text of textNodes(node)) {
				expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH)
			}
		}
	})
})

describe("shortName", () => {
	it("initials the first name and keeps the surname people say", () => {
		expect(shortName("Sebastian Janikowski")).toBe("S. Janikowski")
		expect(shortName("Ken Griffey Jr.")).toBe("K. Griffey")
		expect(shortName("Pelé")).toBe("Pelé")
	})
})

describe("movePill", () => {
	it("counts how far a pick moved, and says when it's the real slot", () => {
		expect(textNodes(movePill(2, 9, 20))).toEqual(["7"])
		expect(textNodes(movePill(3, 3, 20))).toEqual(["Same"])
	})
})

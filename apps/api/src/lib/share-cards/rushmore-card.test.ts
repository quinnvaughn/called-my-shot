import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import {
	buildRushmoreCard,
	nameParts,
	RUSHMORE_SIZE,
	type RushmoreCardData,
} from "./rushmore-card"

// Both layouts are fixed sizes, and satori clips anything past the viewBox
// without a word, so every free-text field (the prompt's title, a player's
// name, the username) is capped in rushmore-card.ts. These hold the caps in
// place.

// A 1x1 transparent PNG, standing in for a portrait.
const PORTRAIT =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

const base: RushmoreCardData = {
	title: "Celtics Rushmore",
	code: "nba-celtics",
	color: "#007A33",
	faces: [
		{ name: "Bill Russell", portrait: PORTRAIT },
		{ name: "Larry Bird", portrait: PORTRAIT },
		{ name: "John Havlicek", portrait: null },
		{ name: "Paul Pierce", portrait: PORTRAIT },
	],
	credit: { kind: "author", username: "quinn" },
}

// The printed address is the longest: the host, a 40-character prompt and a
// 24-character username.
const MAX_TEXT_LENGTH = 95

function images(node: ReturnType<typeof buildRushmoreCard>): string[] {
	const out: string[] = []
	const walk = (n: unknown) => {
		if (!n || typeof n !== "object") return
		const props = (n as { type: string; props: Record<string, unknown> }).props
		if ((n as { type: string }).type === "img") out.push(String(props.src))
		const children = props.children
		if (Array.isArray(children)) children.forEach(walk)
		else walk(children)
	}
	walk(node)
	return out
}

describe("buildRushmoreCard", () => {
	it.each([
		["landscape", 1200, 630],
		["portrait", 1080, 1350],
	] as const)("renders the %s layout at %ix%i", (layout, width, height) => {
		expect(RUSHMORE_SIZE[layout]).toEqual({ width, height })
		const node = buildRushmoreCard(base, layout)
		expect(node.props.style?.width).toBe(`${width}px`)
		expect(node.props.style?.height).toBe(`${height}px`)
	})

	it.each([
		"landscape",
		"portrait",
	] as const)("caps every text node in the %s layout", (layout) => {
		const node = buildRushmoreCard(
			{
				...base,
				title:
					"Rushmore of point guards who never made an All-Star team ".repeat(5),
				code: "x".repeat(80),
				faces: base.faces.map((f) => ({
					name: `${"Bartholomew ".repeat(4)}${"Wolfeschlegelsteinhausen".repeat(3)}`,
					portrait: f.portrait,
				})),
				credit: { kind: "author", username: "u".repeat(80) },
			},
			layout,
		)
		for (const text of textNodes(node)) {
			expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH)
		}
	})

	it("puts initials in the ring of a player with no portrait", () => {
		const node = buildRushmoreCard(base, "portrait")
		const texts = textNodes(node)
		expect(texts).toContain("JH")
		expect(texts).toContain("John Havlicek")
		// Only the three with portraits get an image.
		expect(images(node).filter((src) => src === PORTRAIT)).toHaveLength(3)
	})

	it("bylines one person's Rushmore and counts a prompt's answers", () => {
		const own = textNodes(buildRushmoreCard(base, "landscape"))
		expect(own).toContain("by @quinn")
		expect(own).toContain("calledmyshot.com/rushmore/nba-celtics/quinn")

		const crowd = textNodes(
			buildRushmoreCard(
				{ ...base, credit: { kind: "crowd", answers: 1284 } },
				"landscape",
			),
		)
		expect(crowd).toContain("1,284 Rushmores")
		expect(crowd.some((t) => t.startsWith("by @"))).toBe(false)
		expect(
			textNodes(
				buildRushmoreCard(
					{ ...base, credit: { kind: "crowd", answers: 1 } },
					"landscape",
				),
			),
		).toContain("1 Rushmore")
	})

	it("draws a prompt in one of the prompt colors", () => {
		const node = buildRushmoreCard({ ...base, color: "#5B3A9E" }, "landscape")
		expect(node.props.style?.width).toBe("1200px")
	})
})

describe("nameParts", () => {
	it.each([
		["Larry Bird", "Larry", "Bird"],
		["Ken Griffey Jr.", "Ken", "Griffey"],
		["Kareem Abdul-Jabbar", "Kareem", "Abdul-Jabbar"],
		["Keith Van Horn", "Keith", "Van Horn"],
		["Pelé", "", "Pelé"],
	])("splits %s as %s / %s", (name, first, last) => {
		expect(nameParts(name)).toEqual({ first, last })
	})
})

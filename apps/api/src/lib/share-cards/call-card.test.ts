import { describe, expect, it } from "vitest"
import type { SatoriNode } from "../share-image"
import { buildCallShareCard, CALL_SHARE_CARD_SIZE } from "./call-card"

// This card is a fixed 1200x630. satori clips anything past that viewBox
// silently - no warning, no scaling - and an overflowing flex child paints
// over its siblings rather than pushing them, so a long enough caseText
// buries the footer instead of erroring. The caps are the only thing standing
// between that and an unfurl nobody looks at twice, and nothing else in the
// system would notice they had drifted.

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
	questionTitle: "Patrick Mahomes over 275.5 passing yards vs. Buffalo",
	leagueAbbr: "NFL",
	categoryLabel: "Player Prop",
	name: "Quinn Vaughn",
	username: "quinn",
	pickLabel: "Over 275.5",
	calledAt: "Mar 3, 2026",
	fieldPct: 12,
	closeness: null,
	conviction: 85,
	caseText: "Their secondary is banged up.",
	points: 240,
	isWin: true,
	quip: "Called it before the line moved.",
	pendingLabel: null,
	streakLength: null,
}

// Generous enough that no legitimate field trips it, tight enough that a
// removed cap does. The real caps live in call-card.ts.
const MAX_TEXT_LENGTH = 200

describe("buildCallShareCard", () => {
	it("renders at exactly the size X crops og:image to", () => {
		expect(CALL_SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 })
	})

	it("caps every text node when the case runs long", () => {
		const node = buildCallShareCard({
			...base,
			caseText: "I have been saying this for two years. ".repeat(20),
		})
		for (const text of textNodes(node)) {
			expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH)
		}
	})

	it("caps a long pick label and a long question title", () => {
		const node = buildCallShareCard({
			...base,
			pickLabel: "Minnesota Timberwolves to win the Western Conference Finals",
			questionTitle: "Which team will win the 2027 Western Conference ".repeat(6),
		})
		const texts = textNodes(node)
		for (const text of texts) {
			expect(text.length).toBeLessThanOrEqual(MAX_TEXT_LENGTH)
		}
		// Truncated, not dropped - the pick is the one thing the card is for.
		expect(texts.some((t) => t.startsWith("Minnesota Timberwolves"))).toBe(true)
	})

	it("states the call date and the points won on a resolved card", () => {
		const texts = textNodes(buildCallShareCard(base))
		expect(texts).toContain("Mar 3, 2026")
		expect(texts).toContain("Points won")
		expect(texts).toContain("+240")
	})

	it("states the points lost on a miss", () => {
		const texts = textNodes(
			buildCallShareCard({ ...base, points: -120, isWin: false }),
		)
		expect(texts).toContain("Missed")
		expect(texts).toContain("Points lost")
		expect(texts).toContain("−120")
	})

	it("states how far off a numeric guess landed", () => {
		const texts = textNodes(
			buildCallShareCard({
				...base,
				pickLabel: "27",
				fieldPct: null,
				closeness: { kind: "off", by: "2" },
			}),
		)
		expect(texts).toContain("Off by")
		expect(texts).toContain("2")
		expect(texts).not.toContain("Field agreed")
	})

	it("gives an exact guess its own face instead of Off by 0", () => {
		const texts = textNodes(
			buildCallShareCard({
				...base,
				pickLabel: "27",
				fieldPct: null,
				closeness: { kind: "exact" },
			}),
		)
		expect(texts).toContain("Nailed it")
		expect(texts).toContain("Exact")
		expect(texts).not.toContain("Off by")
	})

	it("states the streak a winning call extended", () => {
		const texts = textNodes(buildCallShareCard({ ...base, streakLength: 7 }))
		expect(texts).toContain("Streak")
		expect(texts).toContain("7 in a row")
		expect(textNodes(buildCallShareCard(base))).not.toContain("Streak")
	})

	// quipForCall has no vocabulary for a call nobody has graded, so the
	// pending face carries a status instead of a result and no quip at all.
	it("renders a pending face with no result and no quip", () => {
		const texts = textNodes(
			buildCallShareCard({
				...base,
				points: null,
				isWin: null,
				quip: null,
				pendingLabel: "Locks Jun 12, 2027",
			}),
		)
		expect(texts).toContain("Locks Jun 12, 2027")
		expect(texts).toContain("Mar 3, 2026")
		expect(texts.some((t) => t.startsWith("Points"))).toBe(false)
		expect(texts.some((t) => t.includes("Called it before"))).toBe(false)
	})
})

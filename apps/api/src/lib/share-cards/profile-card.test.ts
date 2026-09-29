import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import type { SatoriNode } from "../share-image"
import {
	buildProfileShareCard,
	PROFILE_CARD_WEEKS,
	type ProfileShareData,
} from "./profile-card"

const data = (over: Partial<ProfileShareData> = {}): ProfileShareData => ({
	name: "Quinn Vaughn",
	username: "quinn",
	totalPoints: 4812,
	rank: 14,
	accuracy: 57.4,
	wins: 48,
	losses: 31,
	activeDays: 2,
	startDay: "2026-04-05",
	endDay: "2026-09-30",
	days: [
		{ day: "2026-09-20", settledCount: 4, netPoints: 300 },
		{ day: "2026-09-21", settledCount: 3, netPoints: -80 },
	],
	...over,
})

// Every node in the tree, depth first.
function allNodes(node: SatoriNode, out: SatoriNode[] = []): SatoriNode[] {
	out.push(node)
	const children = node.props.children
	if (Array.isArray(children)) {
		for (const child of children as SatoriNode[]) allNodes(child, out)
	} else if (children && typeof children === "object") {
		allNodes(children as SatoriNode, out)
	}
	return out
}

describe("buildProfileShareCard", () => {
	it("fills the fixed og:image size", () => {
		const node = buildProfileShareCard(data())
		expect(node.props.style?.width).toBe("1200px")
		expect(node.props.style?.height).toBe("630px")
	})

	it("names the caller and states the career in the footer", () => {
		const text = textNodes(buildProfileShareCard(data()))
		expect(text.join(" ")).toContain("Quinn Vaughn · Last 26 weeks")
		expect(text).toContain("4,812")
		expect(text).toContain("#14")
		expect(text).toContain("48-31")
		expect(text).toContain("57%")
		expect(text).toContain("@quinn")
	})

	it("draws one square per day up to today and none after it", () => {
		const cells = allNodes(buildProfileShareCard(data())).filter(
			(node) => node.props.style?.borderRadius === "6px",
		)
		// 2026-04-05 through 2026-09-30 inclusive.
		expect(cells).toHaveLength(179)
		expect(cells.length).toBeLessThanOrEqual(PROFILE_CARD_WEEKS * 7)
	})

	it("shades an up day green and a down day red", () => {
		const nodes = allNodes(buildProfileShareCard(data()))
		const colors = nodes
			.map((node) => node.props.style?.backgroundColor)
			.filter((color) => typeof color === "string")
		// The bigger of the two days is level 4, the success color itself. The
		// smaller sits at level 1, danger blended lightly over the card.
		expect(colors).toContain("#34d399")
		expect(colors).toContain("#5d2826")
	})
})

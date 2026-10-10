import { describe, expect, it } from "vitest"
import { textNodes } from "../../test/helpers"
import { renderShareImage } from "../share-image"
import { SHARE_CARD_SIZE } from "./frame"
import {
	buildGroupRecapCard,
	type GroupRecapCardData,
	type GroupRecapCardTile,
} from "./group-recap-card"

// Fixed 1200x630 like every og:image card. The hero holds at most three tiles,
// and every free-text field is clamped so a long title can't spill.

const tile = (
	overrides: Partial<GroupRecapCardTile> = {},
): GroupRecapCardTile => ({
	label: "Best call",
	leagueAbbr: "NFL",
	name: "Sam Rivera",
	value: "+86",
	tone: "success",
	headline: "Will Patrick Mahomes throw for over 275.5 yards?",
	note: "Picked Over",
	...overrides,
})

const base: GroupRecapCardData = {
	groupName: "Maye the Force Be With You",
	weekLabel: "Oct 6 to 12",
	wins: 41,
	losses: 27,
	accuracy: 60,
	activeMembers: 5,
	tiles: [tile()],
	climber: { name: "Alex", places: 3 },
}

describe("buildGroupRecapCard", () => {
	it("shows three tiles at most", () => {
		const texts = textNodes(
			buildGroupRecapCard({
				...base,
				tiles: ["One", "Two", "Three", "Four"].map((label) => tile({ label })),
			}),
		)
		expect(texts.some((t) => t.startsWith("Three"))).toBe(true)
		expect(texts.some((t) => t.startsWith("Four"))).toBe(false)
	})

	it("names the group in the header instead of a username in the footer", () => {
		const texts = textNodes(buildGroupRecapCard(base))
		expect(texts).toContain("Maye the Force Be With You · Oct 6 to 12")
		expect(texts).toContain("Weekly recap")
		expect(texts).toContain("Alex ↑3")
		expect(texts.some((t) => t.startsWith("@"))).toBe(false)
	})

	it("calls a group miss the group's", () => {
		const texts = textNodes(
			buildGroupRecapCard({
				...base,
				tiles: [tile({ label: "Group miss", name: null, value: "5 of 6" })],
			}),
		)
		expect(texts).toContain("The group")
	})

	it("clamps a long question title", () => {
		const long = "x".repeat(200)
		const texts = textNodes(
			buildGroupRecapCard({ ...base, tiles: [tile({ headline: long })] }),
		)
		expect(texts.every((t) => t.length < 100)).toBe(true)
	})

	it("renders to a png at the card size", async () => {
		const png = await renderShareImage(
			buildGroupRecapCard({
				...base,
				tiles: [
					tile(),
					tile({ label: "Worst miss", value: "−40", tone: "danger" }),
					tile({ label: "Sweep", value: "8 for 8", tone: "success" }),
				],
			}),
			SHARE_CARD_SIZE,
		)
		expect(png.subarray(1, 4).toString()).toBe("PNG")
	})
})

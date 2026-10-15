import { MIN_EDGE_SAMPLE } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { statGridItems } from "./stat-grid"

type Stats = Parameters<typeof statGridItems>[0]

const stats: Stats = {
	rank: 4,
	totalPoints: 1250,
	accuracy: 61.4,
	convictionEdge: 18.4,
	resolvedCallCount: 40,
}

const edgeTile = (overrides: Partial<Stats>) =>
	statGridItems({ ...stats, ...overrides }).find(
		(item) => item.label === "Conviction Edge",
	)

describe("statGridItems", () => {
	it("signs the conviction edge and shows no hint once it's unlocked", () => {
		const tile = edgeTile({})
		expect(tile?.value).toBe("+18")
		expect(tile?.hint).toBeUndefined()
	})

	it("counts down to the edge's sample size", () => {
		const tile = edgeTile({
			convictionEdge: null,
			resolvedCallCount: MIN_EDGE_SAMPLE - 3,
		})
		expect(tile?.value).toBe("-")
		expect(tile?.hint).toBe("3 more to unlock")
	})

	it("asks for a hit and a miss once the sample is there", () => {
		const tile = edgeTile({
			convictionEdge: null,
			resolvedCallCount: MIN_EDGE_SAMPLE,
		})
		expect(tile?.hint).toBe("needs a hit and a miss")
	})

	it("holds rank and accuracy until there's something to show", () => {
		const items = statGridItems({ ...stats, rank: null, accuracy: null })
		expect(items.find((item) => item.label === "Rank")?.value).toBe("N/A")
		expect(items.find((item) => item.label === "Accuracy")?.value).toBe("-")
	})
})

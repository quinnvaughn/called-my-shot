import { describe, expect, it } from "vitest"
import {
	CHAIN_HOLD_BOOST,
	CHAIN_MAX_LINKS,
	CHAIN_MULT_CAP,
	type ChainLinkFacts,
	chainHitChance,
	chainMultiplier,
	computeChain,
	formatChainMultiplier,
} from "./chain"

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 18, 17, minutes))

function link(
	linkId: string,
	overrides: Partial<ChainLinkFacts> = {},
): ChainLinkFacts {
	return {
		linkId,
		userId: `user-${linkId}`,
		questionId: `q-${linkId}`,
		hitChance: 0.5,
		outcome: "hit",
		resultPoints: 150,
		realizedAt: at(0),
		startsAt: at(0),
		...overrides,
	}
}

describe("chainHitChance", () => {
	it("reads a priced side's chance off the selection", () => {
		expect(chainHitChance({ modelHitRate: 0.2, overUnder: null })).toBe(0.2)
	})

	it("reads an over/under's chance off its line, by side", () => {
		const overUnder = { pOver: 0.56 }
		expect(
			chainHitChance({
				modelHitRate: null,
				overUnder: { ...overUnder, side: "over" },
			}),
		).toBe(0.56)
		expect(
			chainHitChance({
				modelHitRate: null,
				overUnder: { ...overUnder, side: "under" },
			}),
		).toBeCloseTo(0.44)
	})

	it("treats an over/under with no model chance as even", () => {
		expect(
			chainHitChance({
				modelHitRate: null,
				overUnder: { side: "under", pOver: null },
			}),
		).toBe(0.5)
	})

	it("has no chance for an unpriced side that isn't an over/under", () => {
		expect(chainHitChance({ modelHitRate: null, overUnder: null })).toBeNull()
	})

	it("refuses a certain or impossible chance", () => {
		expect(chainHitChance({ modelHitRate: 0, overUnder: null })).toBeNull()
		expect(chainHitChance({ modelHitRate: 1, overUnder: null })).toBeNull()
	})
})

describe("chainMultiplier", () => {
	it("doubles for every other coin flip, and pays a tenth over that", () => {
		expect(chainMultiplier([0.5, 0.5, 0.5])).toBeCloseTo(8.8)
	})

	it("is nothing for a link with no others", () => {
		expect(chainMultiplier([])).toBe(1)
	})

	it("stays under the cap at the longest chain of coin flips", () => {
		const others = Array.from({ length: CHAIN_MAX_LINKS - 1 }, () => 0.5)
		expect(chainMultiplier(others)).toBeCloseTo(70.4)
	})

	it("caps a chain of long shots", () => {
		expect(chainMultiplier([0.12, 0.12, 0.12])).toBe(CHAIN_MULT_CAP)
	})
})

describe("computeChain", () => {
	it("multiplies every win when every link hits", () => {
		const result = computeChain([
			link("a", { resultPoints: 150 }),
			link("b", { hitChance: 0.2, resultPoints: 591 }),
		])
		expect(result.state).toBe("held")
		// a's multiplier is 1/0.2 x 1.1 = 5.5x, so 150 becomes 825: an award
		// of 675. b's is 1/0.5 x 1.1 = 2.2x, so 591 becomes 1300: an award of
		// 709.
		expect(result.awards).toEqual([
			{ linkId: "a", userId: "user-a", points: 675 },
			{ linkId: "b", userId: "user-b", points: 709 },
		])
	})

	it("takes back every hit when a link misses, and adds nothing to the miss", () => {
		const result = computeChain([
			link("a", { resultPoints: 150 }),
			link("b", { outcome: "miss", resultPoints: -144 }),
			link("c", { resultPoints: 90 }),
		])
		expect(result.state).toBe("broken")
		expect(result.breakerLinkId).toBe("b")
		expect(result.awards).toEqual([
			{ linkId: "a", userId: "user-a", points: -150 },
			{ linkId: "c", userId: "user-c", points: -90 },
		])
	})

	it("blames the miss that went final first", () => {
		const result = computeChain([
			link("late", { outcome: "miss", realizedAt: at(30) }),
			link("early", { outcome: "miss", realizedAt: at(10) }),
			link("hit"),
		])
		expect(result.breakerLinkId).toBe("early")
	})

	it("falls back to kickoff for a miss with no final time", () => {
		const result = computeChain([
			link("a", { outcome: "miss", realizedAt: at(20) }),
			link("b", { outcome: "miss", realizedAt: null, startsAt: at(5) }),
		])
		expect(result.breakerLinkId).toBe("b")
	})

	it("breaks as soon as a link misses, before the rest have landed", () => {
		const result = computeChain([
			link("a"),
			link("b", { outcome: "miss" }),
			link("c", { outcome: "pending", resultPoints: null }),
		])
		expect(result.state).toBe("broken")
		expect(result.awards.map((award) => award.linkId)).toEqual(["a"])
	})

	it("waits while a link is still pending and nothing has missed", () => {
		const result = computeChain([
			link("a"),
			link("b", { outcome: "pending", resultPoints: null }),
		])
		expect(result.state).toBe("pending")
		expect(result.awards).toEqual([])
		expect(result.multipliers.get("a")).toBeCloseTo(2.2)
	})

	it("drops a void link and multiplies without it", () => {
		const result = computeChain([
			link("a"),
			link("b"),
			link("gone", { outcome: "void", hitChance: 0.1, resultPoints: null }),
		])
		expect(result.state).toBe("held")
		expect(result.multipliers.get("a")).toBeCloseTo(2.2)
		expect(result.multipliers.has("gone")).toBe(false)
	})

	it("voids a chain left with fewer than two counted links", () => {
		const result = computeChain([
			link("a"),
			link("gone", { outcome: "void", resultPoints: null }),
		])
		expect(result).toEqual({
			state: "void",
			breakerLinkId: null,
			multipliers: new Map(),
			awards: [],
		})
	})

	it("pays each member a tenth of their expected win, on average", () => {
		const chances = [0.5, 0.2, 0.65]
		const wins = [150, 591, 105]
		// Every combination of hits and misses, weighted by how often it happens.
		let expected = [0, 0, 0]
		for (let mask = 0; mask < 2 ** chances.length; mask++) {
			let weight = 1
			const links = chances.map((chance, i) => {
				const hit = (mask >> i) & 1
				weight *= hit ? chance : 1 - chance
				return link(String(i), {
					hitChance: chance,
					outcome: hit ? "hit" : "miss",
					resultPoints: hit ? (wins[i] ?? 0) : -100,
				})
			})
			const { awards } = computeChain(links)
			expected = expected.map(
				(sum, i) =>
					sum +
					weight *
						(awards.find((award) => award.linkId === String(i))?.points ?? 0),
			)
		}
		for (const [i, value] of expected.entries()) {
			const chance = chances[i] ?? 0
			const win = wins[i] ?? 0
			expect(value).toBeCloseTo((CHAIN_HOLD_BOOST - 1) * chance * win, 0)
		}
	})
})

describe("formatChainMultiplier", () => {
	it("shows one decimal under 10x and whole numbers past it", () => {
		expect(formatChainMultiplier(2)).toBe("2x")
		expect(formatChainMultiplier(4.1667)).toBe("4.2x")
		expect(formatChainMultiplier(16.66)).toBe("17x")
	})
})

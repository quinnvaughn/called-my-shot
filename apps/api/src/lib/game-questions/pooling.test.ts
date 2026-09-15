import { describe, expect, it } from "vitest"
import {
	addHits,
	boundedLossRate,
	countHits,
	pooledHitRate,
	stepRate,
	sumHits,
} from "./pooling"

describe("countHits", () => {
	it("counts hits and results", () => {
		expect(countHits([true, false, true])).toEqual({ hits: 2, total: 3 })
		expect(addHits({ hits: 1, total: 2 }, { hits: 3, total: 4 })).toEqual({
			hits: 4,
			total: 6,
		})
		expect(sumHits([[true], [false, true], []])).toEqual({ hits: 2, total: 3 })
	})
})

describe("pooledHitRate", () => {
	const pool = { hits: 25, total: 100 }

	it("starts a group with no results at everyone else's rate", () => {
		expect(pooledHitRate({ hits: 0, total: 0 }, pool, 20)).toBe(0.25)
	})

	it("leans on the others while a group's own record is small", () => {
		const own = { hits: 4, total: 4 }
		expect(pooledHitRate(own, addHits(pool, own), 20)).toBeCloseTo(
			(4 + 20 * 0.25) / 24,
		)
	})

	it("follows a group's own record once it's large", () => {
		const own = { hits: 800, total: 1000 }
		const rate = pooledHitRate(own, addHits(pool, own), 20) as number
		expect(rate).toBeGreaterThan(0.78)
		expect(rate).toBeLessThan(0.8)
	})

	it("uses a group's own rate when it's the only one", () => {
		const own = { hits: 3, total: 12 }
		expect(pooledHitRate(own, own, 20)).toBe(0.25)
		expect(
			pooledHitRate({ hits: 0, total: 0 }, { hits: 0, total: 0 }, 20),
		).toBeNull()
	})
})

describe("boundedLossRate", () => {
	it("is where the pick breaks even, within bounds", () => {
		expect(boundedLossRate(0.25, 0.05, 1)).toBe(0.33)
		expect(boundedLossRate(0.5, 0.05, 1)).toBe(1)
		expect(boundedLossRate(0.9, 0.05, 1)).toBe(1)
		expect(boundedLossRate(0, 0.05, 1)).toBe(0.05)
		expect(boundedLossRate(null, 0.05, 1)).toBeNull()
	})
})

describe("stepRate", () => {
	it("moves toward the target by at most a step", () => {
		expect(stepRate(0.25, 0.33, 0.1)).toBe(0.33)
		expect(stepRate(0.25, 1, 0.1)).toBe(0.35)
		expect(stepRate(0.5, 0.1, 0.1)).toBe(0.4)
	})

	it("leaves a rate with no target or already there", () => {
		expect(stepRate(0.33, 0.33, 0.1)).toBeNull()
		expect(stepRate(0.33, null, 0.1)).toBeNull()
	})
})

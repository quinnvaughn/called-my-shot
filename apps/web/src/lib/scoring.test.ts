import { describe, expect, it } from "vitest"
import { hitMultiple } from "./scoring"

describe("hitMultiple", () => {
	it("floors 1 / lossRate", () => {
		expect(hitMultiple(0.25, [null, null, null])).toBe(4)
		expect(hitMultiple(0.3, [null, null])).toBe(3)
		expect(hitMultiple(0.48, [null, null])).toBe(2)
	})

	it("is null where a hit and a miss weigh about the same", () => {
		expect(hitMultiple(0.96, [null, null])).toBeNull()
		expect(hitMultiple(1, [null, null])).toBeNull()
	})

	it("reads the steepest option rate so it holds for every pick", () => {
		expect(hitMultiple(0.96, [0.2, 1.8])).toBeNull()
		expect(hitMultiple(0.25, [0.25, 0.5])).toBe(2)
	})

	it("falls back to the question's rate with no options", () => {
		expect(hitMultiple(0.5, [])).toBe(2)
	})

	it("is null for a non-positive rate", () => {
		expect(hitMultiple(0, [])).toBeNull()
	})
})

import { describe, expect, it } from "vitest"
import { fractionWords, missCost } from "./how-it-works-examples"

describe("fractionWords", () => {
	it("says the common shares in words", () => {
		expect(fractionWords(0.5)).toBe("half")
		expect(fractionWords(0.25)).toBe("a quarter")
		expect(fractionWords(1 / 3)).toBe("a third")
	})

	it("falls back to a whole percent", () => {
		expect(fractionWords(0.4)).toBe("40%")
		expect(fractionWords(0.666)).toBe("67%")
	})
})

describe("missCost", () => {
	it("says everything at a full loss rate", () => {
		expect(missCost(1)).toBe("everything you committed")
	})

	it("names the share below that", () => {
		expect(missCost(0.5)).toBe("half of what you committed")
	})
})

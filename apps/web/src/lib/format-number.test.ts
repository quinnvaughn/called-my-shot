import { describe, expect, it } from "vitest"
import { clamp, formatPercent, formatSigned } from "./format-number"

describe("formatSigned", () => {
	it("puts a plus on a gain and a typographic minus on a loss", () => {
		expect(formatSigned(12)).toBe("+12")
		expect(formatSigned(-4)).toBe("−4")
	})

	it("leaves a zero bare unless asked to sign it", () => {
		expect(formatSigned(0)).toBe("0")
		expect(formatSigned(-0)).toBe("0")
		expect(formatSigned(0, { zeroSign: true })).toBe("+0")
	})

	it("keeps decimals as given when not rounding", () => {
		expect(formatSigned(12.5)).toBe("+12.5")
		expect(formatSigned(-0.25)).toBe("−0.25")
	})

	it("rounds to a whole number", () => {
		expect(formatSigned(17.6, { round: "whole" })).toBe("+18")
		expect(formatSigned(-17.6, { round: "whole" })).toBe("−18")
		expect(formatSigned(0.4, { round: "whole" })).toBe("0")
		expect(formatSigned(-0.4, { round: "whole" })).toBe("0")
		expect(formatSigned(0.4, { round: "whole", zeroSign: true })).toBe("+0")
	})

	it("keeps one decimal on anything not already whole", () => {
		expect(formatSigned(4, { round: "tenth" })).toBe("+4")
		expect(formatSigned(4.25, { round: "tenth" })).toBe("+4.3")
		expect(formatSigned(-2.96, { round: "tenth" })).toBe("−3.0")
		expect(formatSigned(0.04, { round: "tenth" })).toBe("0.0")
	})
})

describe("formatPercent", () => {
	it("writes a ratio as a whole percent", () => {
		expect(formatPercent(0.237)).toBe("24%")
		expect(formatPercent(0)).toBe("0%")
		expect(formatPercent(1)).toBe("100%")
	})
})

describe("clamp", () => {
	it("holds a value inside the range", () => {
		expect(clamp(5, 0, 10)).toBe(5)
		expect(clamp(-1, 0, 10)).toBe(0)
		expect(clamp(11, 0, 10)).toBe(10)
	})

	it("falls back to min when the range is inverted", () => {
		expect(clamp(5, 10, 0)).toBe(10)
	})
})

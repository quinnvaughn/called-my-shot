import { css } from "styled-system/css"
import { describe, expect, it } from "vitest"
import { signTone } from "./sign-tone"

describe("signTone", () => {
	it("colors by side of zero", () => {
		expect(signTone(1)).toBe(css({ color: "success.default" }))
		expect(signTone(-1)).toBe(css({ color: "danger.default" }))
		expect(signTone(0)).toBe(css({ color: "fg.default" }))
	})

	it("is muted when there's no number yet", () => {
		expect(signTone(null)).toBe(css({ color: "fg.muted" }))
	})

	it("counts a zero as a gain when it's written +0", () => {
		expect(signTone(0, { zeroSign: true })).toBe(
			css({ color: "success.default" }),
		)
	})
})

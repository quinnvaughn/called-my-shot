import { describe, expect, it } from "vitest"
import { promptSubject } from "./subject"

describe("promptSubject", () => {
	it("drops Rushmore however it's phrased, front or back", () => {
		for (const title of [
			"Rushmore of NBA point guards",
			"Mount Rushmore of NBA point guards",
			"Mt. Rushmore: NBA point guards",
			"My Rushmore of NBA point guards",
			"NBA point guards Rushmore",
			"NBA point guards mount rushmore",
			"NBA point guards - Rushmore",
		]) {
			expect(promptSubject(title)).toBe("NBA point guards")
		}
		expect(promptSubject("Rushmore of the Celtics")).toBe("Celtics")
	})

	it("leaves a title without it alone", () => {
		expect(promptSubject("2010s point guards")).toBe("2010s point guards")
		expect(promptSubject("Rushmoreville legends")).toBe("Rushmoreville legends")
	})

	it("comes out empty when Rushmore was all there was", () => {
		expect(promptSubject("Mount Rushmore")).toBe("")
	})
})

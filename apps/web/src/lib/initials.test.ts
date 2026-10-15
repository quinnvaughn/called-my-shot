import { describe, expect, it } from "vitest"
import { initials } from "./initials"

describe("initials", () => {
	it("takes the first and last name", () => {
		expect(initials("Mookie Betts")).toBe("MB")
		expect(initials("Shai Gilgeous Alexander")).toBe("SA")
	})

	it("skips a generational suffix", () => {
		expect(initials("Ronald Acuña Jr.")).toBe("RA")
		expect(initials("Ken Griffey Sr")).toBe("KG")
	})

	it("gives one letter for a single name", () => {
		expect(initials("quinn")).toBe("Q")
	})

	it("ignores stray whitespace", () => {
		expect(initials("  Aaron   Judge ")).toBe("AJ")
	})
})

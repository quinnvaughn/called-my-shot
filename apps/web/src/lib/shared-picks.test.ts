import { describe, expect, it } from "vitest"
import { sharedPicksLine, surname } from "./shared-picks"

const p = (id: string, name: string) => ({ id, name })
const theirs = [
	p("1", "Stephen Curry"),
	p("2", "Chris Paul"),
	p("3", "James Harden"),
	p("4", "Damian Lillard"),
]

describe("sharedPicksLine", () => {
	it("names the players both Rushmores have", () => {
		expect(sharedPicksLine(theirs, [{ id: "1" }, { id: "9" }])).toBe(
			"You both have Curry.",
		)
		expect(
			sharedPicksLine(theirs, [{ id: "1" }, { id: "2" }, { id: "3" }]),
		).toBe("You both have Curry, Paul and Harden.")
	})

	it("says so when it's all four or none", () => {
		expect(sharedPicksLine(theirs, theirs)).toBe("Same four as yours.")
		expect(sharedPicksLine(theirs, [{ id: "9" }])).toBe(
			"None of your four are on this one.",
		)
	})
})

describe("surname", () => {
	it("skips a suffix", () => {
		expect(surname("Ken Griffey Jr.")).toBe("Griffey")
		expect(surname("Cal Ripken Jr")).toBe("Ripken")
		expect(surname("Nenê")).toBe("Nenê")
	})
})

import { describe, expect, it } from "vitest"
import {
	doubtersVerdict,
	gloatChoices,
	gloatText,
	resolvedFadeLine,
} from "./fade-copy"

const noFade = {
	fadedUsername: null,
	fadeLanded: null,
	targetFlipped: false,
	doubtersCashed: 0,
	doubtersWrong: 0,
	gloatOpen: false,
}

describe("gloats", () => {
	it("reads the api's enum name as its line", () => {
		expect(gloatText("TOLD_YOU")).toBe("Told you.")
		expect(gloatText("CALLED_IT")).toBe("Called it.")
	})

	it("offers each side its own lines, keyed the way the api takes them", () => {
		expect(gloatChoices("target").map((c) => c.value)).toContain("TOLD_YOU")
		expect(gloatChoices("fader").map((c) => c.value)).toContain("CALLED_IT")
		expect(gloatChoices("fader").map((c) => c.value)).not.toContain("TOLD_YOU")
	})
})

describe("doubtersVerdict", () => {
	it("says nothing before anything settles", () => {
		expect(doubtersVerdict(0, 0)).toBeNull()
	})

	it("covers all right, all wrong, and a split", () => {
		expect(doubtersVerdict(1, 0)).toBe("The doubter called it")
		expect(doubtersVerdict(3, 0)).toBe("All 3 doubters called it")
		expect(doubtersVerdict(0, 1)).toBe("The doubter was wrong")
		expect(doubtersVerdict(0, 3)).toBe("All 3 doubters were wrong")
		expect(doubtersVerdict(2, 1)).toBe("2 of 3 doubters called it")
	})
})

describe("resolvedFadeLine", () => {
	it("is null with no fade either way", () => {
		expect(resolvedFadeLine(noFade)).toBeNull()
	})

	it("tells a fader how their fade went", () => {
		expect(
			resolvedFadeLine({ ...noFade, fadedUsername: "op", fadeLanded: true }),
		).toBe("Your fade on @op hit.")
		expect(
			resolvedFadeLine({ ...noFade, fadedUsername: "op", fadeLanded: false }),
		).toBe("Your fade on @op missed.")
		expect(
			resolvedFadeLine({
				...noFade,
				fadedUsername: "op",
				targetFlipped: true,
			}),
		).toBe("@op flipped onto your side.")
	})

	it("tells a faded caller how their doubters did", () => {
		expect(resolvedFadeLine({ ...noFade, doubtersWrong: 3 })).toBe(
			"3 doubters, all wrong.",
		)
		expect(resolvedFadeLine({ ...noFade, doubtersCashed: 1 })).toBe(
			"Your doubter called it.",
		)
		expect(
			resolvedFadeLine({ ...noFade, doubtersCashed: 2, doubtersWrong: 1 }),
		).toBe("2 of 3 doubters called it.")
	})

	it("joins both halves when a call faded and was faded", () => {
		expect(
			resolvedFadeLine({
				...noFade,
				fadedUsername: "op",
				fadeLanded: true,
				doubtersWrong: 1,
			}),
		).toBe("Your fade on @op hit. Your doubter was wrong.")
	})

	it("asks the winner to gloat while the call page still offers one", () => {
		expect(
			resolvedFadeLine({
				...noFade,
				fadedUsername: "op",
				fadeLanded: true,
				gloatOpen: true,
			}),
		).toBe("Your fade on @op hit. Send them a line.")
		expect(
			resolvedFadeLine({ ...noFade, doubtersWrong: 1, gloatOpen: true }),
		).toBe("Your doubter was wrong. Send them a line.")
	})
})

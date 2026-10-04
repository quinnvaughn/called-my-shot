import { describe, expect, it } from "vitest"
import { alignmentText, compareWithInviter } from "./welcome-alignment"

const pick = (optionIds: string[], guessValue: number | null = null) => ({
	optionIds,
	guessValue,
})

describe("compareWithInviter", () => {
	it("calls a single pick the same or different", () => {
		expect(compareWithInviter(pick(["a"]), pick(["a"]), "single")).toEqual({
			kind: "same",
		})
		expect(compareWithInviter(pick(["a"]), pick(["b"]), "single")).toEqual({
			kind: "different",
		})
	})

	it("counts shared picks out of the inviter's", () => {
		expect(
			compareWithInviter(pick(["a", "b", "c"]), pick(["b", "c", "d"]), "multi"),
		).toEqual({ kind: "overlap", shared: 2, total: 3 })
	})

	it("measures the gap between guesses", () => {
		expect(compareWithInviter(pick([], 48), pick([], 52.5), "numeric")).toEqual(
			{ kind: "gap", gap: 4.5 },
		)
	})
})

describe("alignmentText", () => {
	const format = (n: number) => String(n)

	it("names the inviter and their pick", () => {
		expect(alignmentText({ kind: "same" }, "jordan", "Over 52.5", format)).toBe(
			"You and @jordan both took Over 52.5.",
		)
		expect(
			alignmentText({ kind: "different" }, "jordan", "Over 52.5", format),
		).toBe("You went the other way from @jordan, who took Over 52.5.")
		expect(
			alignmentText(
				{ kind: "overlap", shared: 0, total: 3 },
				"jordan",
				"",
				format,
			),
		).toBe("None of your picks match @jordan's.")
		expect(
			alignmentText({ kind: "gap", gap: 4.5 }, "jordan", "52.5", format),
		).toBe("Your guess is 4.5 away from @jordan's 52.5.")
	})
})

import { describe, expect, it } from "vitest"
import type { CreateQuestionValues } from "./form-context"
import { DEFAULT_VALUES } from "./test-utils"
import { toCreateQuestionInput } from "./to-create-question-input"

function values(
	over: Partial<CreateQuestionValues> = {},
): CreateQuestionValues {
	return { ...DEFAULT_VALUES, ...over }
}

describe("toCreateQuestionInput", () => {
	it("uppercases the enums the GraphQL schema expects", () => {
		const input = toCreateQuestionInput(
			values({
				shape: "player_season_stat_over_under",
				statAggregation: "per_game",
				awardVerb: "win",
			}),
		)
		expect(input.shape).toBe("PLAYER_SEASON_STAT_OVER_UNDER")
		expect(input.statAggregation).toBe("PER_GAME")
		expect(input.awardVerb).toBe("WIN")
	})

	it("leaves the optional enums undefined rather than uppercasing nothing", () => {
		const input = toCreateQuestionInput(values())
		expect(input.statAggregation).toBeUndefined()
		expect(input.awardVerb).toBeUndefined()
	})

	it("drops empty strings to undefined so they don't persist as blanks", () => {
		const input = toCreateQuestionInput(
			values({
				resolutionSourceUrl: "",
				customStat: "",
				eventClause: "",
				awardName: "",
			}),
		)
		expect(input.resolutionSourceUrl).toBeUndefined()
		expect(input.customStat).toBeUndefined()
		expect(input.eventClause).toBeUndefined()
		expect(input.awardName).toBeUndefined()
	})

	it("keeps non-empty strings", () => {
		const input = toCreateQuestionInput(
			values({ awardName: "MVP", eventClause: "wins the title" }),
		)
		expect(input.awardName).toBe("MVP")
		expect(input.eventClause).toBe("wins the title")
	})

	it("resolves the naive picker datetime to a real UTC instant", () => {
		const input = toCreateQuestionInput(values({ locksAt: "2026-03-01T19:30" }))
		// The picker's clock is the browser's, so the offset has to be applied
		// here rather than left for the API to guess.
		expect(input.locksAt).toMatch(/^2026-03-0[12]T\d{2}:\d{2}/)
		expect(new Date(input.locksAt).toString()).not.toBe("Invalid Date")
	})

	it("passes an unparseable locksAt through untouched rather than sending null", () => {
		const input = toCreateQuestionInput(values({ locksAt: "nonsense" }))
		expect(input.locksAt).toBe("nonsense")
	})

	it("carries only the three fields the API wants off each option", () => {
		const input = toCreateQuestionInput(
			values({
				options: [{ label: "A", teamId: "t1", playerId: undefined }],
			}),
		)
		expect(input.options).toEqual([
			{ label: "A", teamId: "t1", playerId: undefined },
		])
	})

	it("omits the ballot entirely when there isn't one", () => {
		expect(toCreateQuestionInput(values()).ballot).toBeUndefined()
	})

	it("drops a blank ballot slot to undefined but keeps the label", () => {
		const input = toCreateQuestionInput(
			values({ ballot: { ballotId: "b1", label: "Week 1", slot: "" } }),
		)
		expect(input.ballot).toEqual({
			ballotId: "b1",
			label: "Week 1",
			slot: undefined,
		})
	})
})

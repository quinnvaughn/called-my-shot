import { describe, expect, it } from "vitest"
import { favoriteOf } from "./leaders"

describe("favoriteOf", () => {
	it("takes the best average and counts everyone with one", () => {
		expect(
			favoriteOf([
				{ playerId: "a", mean: 21.23456 },
				{ playerId: "b", mean: 27.5 },
				{ playerId: "c", mean: null },
				{ playerId: "d", mean: 12 },
			]),
		).toEqual({ favoritePlayerId: "b", favoriteMean: 27.5, contenders: 3 })
	})

	it("keeps the first of a tie", () => {
		expect(
			favoriteOf([
				{ playerId: "a", mean: 8 },
				{ playerId: "b", mean: 8 },
			])?.favoritePlayerId,
		).toBe("a")
	})

	it("has no favorite without an average above zero", () => {
		expect(favoriteOf([])).toBeNull()
		expect(favoriteOf([{ playerId: "a", mean: null }])).toBeNull()
		expect(favoriteOf([{ playerId: "a", mean: 0 }])).toBeNull()
	})
})

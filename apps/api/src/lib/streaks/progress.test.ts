import { describe, expect, it } from "vitest"
import { type SlateProgressGame, slateProgress } from "./progress"

function game(
	gameId: string,
	overrides: Partial<SlateProgressGame> = {},
): SlateProgressGame {
	return {
		gameId,
		status: "open",
		locked: false,
		called: true,
		outcome: "skip",
		...overrides,
	}
}

const won = (gameId: string) =>
	game(gameId, { status: "resolved", locked: true, outcome: "win" })

describe("slateProgress", () => {
	it("has nothing to track for a slate too small to sweep", () => {
		expect(
			slateProgress([game("a"), game("b"), game("c", { status: "voided" })]),
		).toBeNull()
	})

	it("is alive while every game is called and nothing has missed", () => {
		const progress = slateProgress([
			won("a"),
			game("b"),
			game("c", { called: false }),
		])
		expect(progress).toMatchObject({
			status: "alive",
			gameCount: 3,
			calledCount: 2,
			winCount: 1,
			pendingCount: 2,
		})
	})

	it("is off once a game locks without a pick", () => {
		const progress = slateProgress([
			won("a"),
			game("b", { status: "locked", locked: true, called: false }),
			game("c"),
		])
		expect(progress?.status).toBe("off")
		expect(progress?.missedGameIds).toEqual(["b"])
	})

	it("is off once a pick misses", () => {
		const progress = slateProgress([
			won("a"),
			game("b", { status: "resolved", locked: true, outcome: "loss" }),
			game("c"),
		])
		expect(progress?.status).toBe("off")
		expect(progress?.lostGameIds).toEqual(["b"])
	})

	it("is swept when every game is called right", () => {
		expect(slateProgress([won("a"), won("b"), won("c")])?.status).toBe("swept")
	})

	it("is off when the slate settles without every game a win", () => {
		const progress = slateProgress([
			won("a"),
			won("b"),
			game("c", { status: "resolved", locked: true, outcome: "skip" }),
		])
		expect(progress?.status).toBe("off")
	})
})

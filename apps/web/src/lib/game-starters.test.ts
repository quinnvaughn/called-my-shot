import { describe, expect, it } from "vitest"
import type { GameStarters_GameFragment } from "#/graphql/generated/graphql"
import { keyStarters } from "./game-starters"

type Starter = GameStarters_GameFragment["starters"][number]

const starter = (
	id: string,
	role: Starter["role"],
	position: string | null = null,
): Starter => ({
	id,
	role,
	sortOrder: 1,
	playerName: id,
	position,
	statLine: null,
	injuryStatus: null,
	team: { id: "t" },
	player: null,
})

describe("keyStarters", () => {
	it("leads with the probable pitcher over everyone else", () => {
		const pitcher = starter("p", "STARTING_PITCHER")
		expect(keyStarters([starter("b", "BATTER"), pitcher])).toEqual([pitcher])
	})

	it("uses the goalie when there's no pitcher", () => {
		const goalie = starter("g", "STARTING_GOALIE")
		expect(keyStarters([starter("s", "STARTER"), goalie])).toEqual([goalie])
	})

	it("picks the quarterback out of a football offense", () => {
		const qb = starter("qb", "OFFENSE", "QB")
		expect(
			keyStarters([
				starter("wr", "OFFENSE", "WR"),
				qb,
				starter("lb", "DEFENSE"),
			]),
		).toEqual([qb])
	})

	it("falls back to the starting five, and nothing when there's no key line", () => {
		const five = ["a", "b", "c", "d", "e"].map((id) => starter(id, "STARTER"))
		expect(keyStarters(five)).toEqual(five)
		expect(keyStarters([starter("wr", "OFFENSE", "WR")])).toEqual([])
	})
})

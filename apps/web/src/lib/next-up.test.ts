import { describe, expect, it } from "vitest"
import type { BallotMemberState } from "./ballot-member-state"
import { type NextUpEntry, nextUpEntry, pickNextUp } from "./next-up"

const LAL = "lal"
const BOS = "bos"

const entry = (
	shape: NextUpEntry["shape"],
	soleTeamId: string | null = null,
	sideTeamIds: string[] = [],
): NextUpEntry => ({ shape, soleTeamId, sideTeamIds })

// The game page's order: winner, total, both team lines, a head to head, a
// player line on each side, a leader pool.
const GAME = [
	entry("TEAM_VS_TEAM"),
	entry("GAME_TOTAL_OVER_UNDER"),
	entry("TEAM_STAT_OVER_UNDER", BOS),
	entry("TEAM_STAT_OVER_UNDER", LAL),
	entry("PLAYER_VS_PLAYER", null, [BOS, LAL]),
	entry("PLAYER_STAT_OVER_UNDER", BOS),
	entry("PLAYER_STAT_OVER_UNDER", LAL),
	entry("PLAYER_GAME_STAT_LEADER"),
]

const states = (called: number[]): BallotMemberState[] =>
	GAME.map((_, i) => (called.includes(i) ? "pending" : "uncalled"))

describe("pickNextUp", () => {
	it("sends the viewer to who wins first while it's uncalled", () => {
		expect(pickNextUp(GAME, states([]), 5, null)).toEqual({
			index: 0,
			aboutPickedTeam: false,
		})
	})

	it("puts the picked team's own lines first after the winner call", () => {
		expect(pickNextUp(GAME, states([0]), 0, LAL)).toEqual({
			index: 3,
			aboutPickedTeam: true,
		})
	})

	it("takes a head to head with the picked team on it next", () => {
		expect(pickNextUp(GAME, states([0, 3, 6]), 6, LAL)).toEqual({
			index: 4,
			aboutPickedTeam: false,
		})
	})

	it("falls back to the page's order, wrapping, once nothing is about the team", () => {
		expect(pickNextUp(GAME, states([0, 3, 4, 6, 7]), 7, LAL)).toEqual({
			index: 1,
			aboutPickedTeam: false,
		})
	})

	it("keeps the page's order with no winner pick to go on", () => {
		expect(pickNextUp(GAME, states([0]), 1, null)).toEqual({
			index: 2,
			aboutPickedTeam: false,
		})
	})

	it("never sends the viewer back to the question on screen", () => {
		const onlyLeft: BallotMemberState[] = GAME.map((_, i) =>
			i === 7 ? "uncalled" : "pending",
		)
		expect(pickNextUp(GAME, onlyLeft, 7, LAL)).toBeNull()
	})

	it("skips questions that can no longer be called", () => {
		const missed = states([0]).map((s, i) => (i === 3 ? "missed" : s))
		expect(pickNextUp(GAME, missed, 0, LAL)?.index).toBe(6)
	})
})

describe("nextUpEntry", () => {
	const teams = [LAL, BOS]

	it("reads a player line's team off the player", () => {
		expect(
			nextUpEntry(
				{
					shape: "PLAYER_STAT_OVER_UNDER",
					subjectPlayer: { currentTeam: { id: LAL } },
					options: [],
				},
				teams,
			).soleTeamId,
		).toBe(LAL)
	})

	it("ignores a team that isn't playing in the game", () => {
		expect(
			nextUpEntry(
				{
					shape: "PLAYER_STAT_OVER_UNDER",
					subjectPlayer: { currentTeam: { id: "traded-to" } },
					options: [],
				},
				teams,
			).soleTeamId,
		).toBeNull()
	})

	it("puts both sides of a head to head on it", () => {
		expect(
			nextUpEntry(
				{
					shape: "PLAYER_VS_PLAYER",
					options: [
						{ player: { currentTeam: { id: BOS } } },
						{ player: { currentTeam: { id: LAL } } },
					],
				},
				teams,
			).sideTeamIds,
		).toEqual([BOS, LAL])
	})
})

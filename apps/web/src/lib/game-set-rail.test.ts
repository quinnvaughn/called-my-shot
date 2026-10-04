import { describe, expect, it } from "vitest"
import { gameSetRailLabel, liveStanding } from "./game-set-rail"

const question = (
	overrides: Partial<Parameters<typeof gameSetRailLabel>[0]>,
): Parameters<typeof gameSetRailLabel>[0] => ({
	title: "The title",
	shape: "PLAYER_STAT_OVER_UNDER",
	stat: { name: "Passing Yards" },
	subjectTeam: null,
	subjectPlayer: { name: "Justin Herbert" },
	options: [],
	...overrides,
})

describe("gameSetRailLabel", () => {
	it("names the player and the stat on a player line", () => {
		expect(gameSetRailLabel(question({}))).toBe("Herbert PASS YDS")
	})

	it("adds the stat to a head-to-head", () => {
		expect(
			gameSetRailLabel(
				question({
					shape: "PLAYER_VS_PLAYER",
					subjectPlayer: null,
					options: [{ label: "Justin Herbert" }, { label: "Sam Darnold" }],
				}),
			),
		).toBe("Herbert v Darnold PASS YDS")
	})

	it("calls the who-wins question the game winner", () => {
		expect(gameSetRailLabel(question({ shape: "TEAM_VS_TEAM" }))).toBe(
			"Game winner",
		)
	})

	it("falls back to the title when there's nothing to build a label from", () => {
		expect(
			gameSetRailLabel(question({ subjectPlayer: null, stat: null })),
		).toBe("The title")
	})
})

describe("liveStanding", () => {
	const twoSided = (a: number | null, b: number | null) => ({
		value: null,
		optionValues: [
			{ optionId: "a", value: a },
			{ optionId: "b", value: b },
		],
	})

	it("has nothing to say without a reading", () => {
		expect(
			liveStanding({
				shape: "PLAYER_STAT_OVER_UNDER",
				reading: null,
				pickedOptionIds: ["over"],
				isRate: false,
			}),
		).toBeNull()
	})

	// An Under that's under at halftime hasn't won anything yet.
	it("leaves a single stat untoned", () => {
		expect(
			liveStanding({
				shape: "PLAYER_STAT_OVER_UNDER",
				reading: { value: 187, optionValues: null },
				pickedOptionIds: ["under"],
				isRate: false,
			}),
		).toEqual({ value: "187", detail: "so far", tone: "default" })
	})

	it("puts the pick's side first on a head-to-head", () => {
		expect(
			liveStanding({
				shape: "TEAM_VS_TEAM",
				reading: twoSided(10, 14),
				pickedOptionIds: ["b"],
				isRate: false,
			}),
		).toEqual({ value: "14–10", detail: "Leading", tone: "success" })
		expect(
			liveStanding({
				shape: "PLAYER_VS_PLAYER",
				reading: twoSided(10, 14),
				pickedOptionIds: ["a"],
				isRate: false,
			}),
		).toEqual({ value: "10–14", detail: "Trailing", tone: "danger" })
	})

	it("reads a side with nothing yet as zero", () => {
		expect(
			liveStanding({
				shape: "PLAYER_VS_PLAYER",
				reading: twoSided(null, null),
				pickedOptionIds: ["a"],
				isRate: false,
			}),
		).toEqual({ value: "0–0", detail: "Tied", tone: "muted" })
	})

	it("says what the leader has when the pick isn't leading", () => {
		const reading = {
			value: null,
			optionValues: [
				{ optionId: "a", value: 41 },
				{ optionId: "b", value: 58 },
				{ optionId: "c", value: null },
			],
		}
		expect(
			liveStanding({
				shape: "PLAYER_GAME_STAT_LEADER",
				reading,
				pickedOptionIds: ["a"],
				isRate: false,
			}),
		).toEqual({ value: "41", detail: "Leader has 58", tone: "muted" })
		expect(
			liveStanding({
				shape: "PLAYER_GAME_STAT_LEADER",
				reading,
				pickedOptionIds: ["b"],
				isRate: false,
			}),
		).toEqual({ value: "58", detail: "Leading", tone: "success" })
	})
})

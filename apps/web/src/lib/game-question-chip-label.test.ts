import { describe, expect, it } from "vitest"
import {
	type ChipLabelQuestion,
	gameQuestionChipLabel,
	gameQuestionChipLabels,
	playerLastName,
	statAbbreviation,
} from "./game-question-chip-label"

const question = (
	overrides: Partial<ChipLabelQuestion> & Pick<ChipLabelQuestion, "shape">,
): ChipLabelQuestion => ({
	stat: null,
	subjectTeam: null,
	subjectPlayer: null,
	options: [],
	...overrides,
})

describe("playerLastName", () => {
	it("takes the last name, skipping generational suffixes", () => {
		expect(playerLastName("Josh Allen")).toBe("Allen")
		expect(playerLastName("Marvin Harrison Jr.")).toBe("Harrison")
		expect(playerLastName("Kenneth Walker III")).toBe("Walker")
		expect(playerLastName("Nenê")).toBe("Nenê")
	})
})

describe("statAbbreviation", () => {
	it("abbreviates catalog stats and passes anything else through", () => {
		expect(statAbbreviation("Passing Yards")).toBe("PASS YDS")
		expect(statAbbreviation("Strikeouts (Pitching)")).toBe("K")
		expect(statAbbreviation("Steals")).toBe("Steals")
	})
})

describe("gameQuestionChipLabel", () => {
	it("labels each game shape from its subject", () => {
		expect(gameQuestionChipLabel(question({ shape: "TEAM_VS_TEAM" }))).toBe(
			"Winner",
		)
		expect(
			gameQuestionChipLabel(
				question({
					shape: "TEAM_STAT_NUMERIC_GUESS",
					stat: { name: "Points" },
					subjectTeam: { abbreviation: "DAL" },
				}),
			),
		).toBe("DAL PTS")
		expect(
			gameQuestionChipLabel(
				question({
					shape: "PLAYER_STAT_OVER_UNDER",
					stat: { name: "Passing Yards" },
					subjectPlayer: { name: "Dak Prescott" },
				}),
			),
		).toBe("Prescott")
		expect(
			gameQuestionChipLabel(
				question({
					shape: "PLAYER_VS_PLAYER",
					options: [{ label: "Josh Allen" }, { label: "Patrick Mahomes" }],
				}),
			),
		).toBe("Allen v Mahomes")
		expect(
			gameQuestionChipLabel(
				question({
					shape: "PLAYER_GAME_STAT_LEADER",
					stat: { name: "Rushing Yards" },
				}),
			),
		).toBe("RUSH YDS")
	})

	it("is null when the subject its label needs is missing", () => {
		expect(
			gameQuestionChipLabel(question({ shape: "TEAM_STAT_NUMERIC_GUESS" })),
		).toBeNull()
		expect(
			gameQuestionChipLabel(
				question({ shape: "PLAYER_VS_PLAYER", options: [{ label: "A B" }] }),
			),
		).toBeNull()
		expect(
			gameQuestionChipLabel(question({ shape: "PLAYER_SEASON_AWARD" })),
		).toBeNull()
	})
})

describe("gameQuestionChipLabels", () => {
	it("appends the stat to labels that would otherwise repeat", () => {
		const allen = { name: "Josh Allen" }
		expect(
			gameQuestionChipLabels([
				question({ shape: "TEAM_VS_TEAM" }),
				question({
					shape: "PLAYER_STAT_OVER_UNDER",
					stat: { name: "Passing Yards" },
					subjectPlayer: allen,
				}),
				question({
					shape: "PLAYER_STAT_OVER_UNDER",
					stat: { name: "Rushing Yards" },
					subjectPlayer: allen,
				}),
			]),
		).toEqual(["Winner", "Allen PASS YDS", "Allen RUSH YDS"])
	})
})

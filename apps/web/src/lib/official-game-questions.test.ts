import { describe, expect, it } from "vitest"
import type { QuestionShape } from "#/graphql/generated/graphql"
import {
	officialQuestionSequence,
	sectionOfficialQuestions,
} from "./official-game-questions"

const question = (id: string, shape: QuestionShape, minute: number) => ({
	id,
	shape,
	createdAt: new Date(Date.UTC(2026, 8, 1, 12, minute)).toISOString(),
})

describe("sectionOfficialQuestions", () => {
	it("orders sections by kind, oldest first within each, dropping empty ones", () => {
		const sections = sectionOfficialQuestions([
			question("leader", "PLAYER_GAME_STAT_LEADER", 5),
			question("home-points", "TEAM_STAT_NUMERIC_GUESS", 2),
			question("admin", "YES_NO_PROP", 1),
			question("away-points", "TEAM_STAT_NUMERIC_GUESS", 1),
		])
		expect(
			sections.map((s) => [s.label, s.questions.map((q) => q.id)]),
		).toEqual([
			["Team scores", ["away-points", "home-points"]],
			["Game leader", ["leader"]],
			["More", ["admin"]],
		])
	})
})

describe("officialQuestionSequence", () => {
	it("puts the game winner first, then every section in order", () => {
		const sequence = officialQuestionSequence([
			question("line", "PLAYER_STAT_OVER_UNDER", 3),
			question("winner", "TEAM_VS_TEAM", 9),
			question("away-points", "TEAM_STAT_NUMERIC_GUESS", 1),
		])
		expect(sequence.map((e) => [e.section, e.question.id])).toEqual([
			["Game winner", "winner"],
			["Team scores", "away-points"],
			["Player lines", "line"],
		])
	})

	it("has no winner entry before the who-wins question exists", () => {
		expect(
			officialQuestionSequence([
				question("away-points", "TEAM_STAT_NUMERIC_GUESS", 1),
			]).map((e) => e.section),
		).toEqual(["Team scores"])
	})
})

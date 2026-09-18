import { resolutionModeFor } from "@called-my-shot/schemas"
import { describe, expect, it } from "vitest"
import {
	activeGameTemplates,
	GAME_QUESTION_CATALOG,
	GENERATION_TIER,
	PLAYER_QUESTIONS_PER_GAME,
} from "./game-question-catalog"

describe("GAME_QUESTION_CATALOG", () => {
	for (const [leagueSlug, templates] of Object.entries(GAME_QUESTION_CATALOG)) {
		it(`${leagueSlug}: every template settles from ESPN`, () => {
			for (const template of templates) {
				expect(
					resolutionModeFor({
						shape: template.shape,
						leagueSlug,
						statName: template.statName,
					}),
					template.id,
				).toBe("system")
			}
		})

		it(`${leagueSlug}: template ids are unique`, () => {
			const ids = templates.map((template) => template.id)
			expect(new Set(ids).size).toBe(ids.length)
		})

		it(`${leagueSlug}: every template in a group asks about the same stat`, () => {
			const statByGroup = new Map<string, string>()
			for (const template of templates) {
				if (!("group" in template)) continue
				const stat = statByGroup.get(template.group) ?? template.statName
				expect(template.statName, template.id).toBe(stat)
				statByGroup.set(template.group, stat)
			}
		})

		// Official questions come back oldest first (see Game.officialQuestions),
		// and the generator posts in catalog order, so whichever template on a
		// stat comes first here leads the game page.
		it(`${leagueSlug}: leads with the over/under on a stat it also guesses`, () => {
			const guesses = templates.filter(
				(template) => template.shape === "team_stat_numeric_guess",
			)
			for (const guess of guesses) {
				const line = templates.find(
					(template) =>
						template.shape === "team_stat_over_under" &&
						template.statName === guess.statName,
				)
				expect(line, `${guess.id} has no over/under`).toBeDefined()
				expect(
					templates.indexOf(line as (typeof templates)[number]),
					guess.id,
				).toBeLessThan(templates.indexOf(guess))
			}
		})

		it(`${leagueSlug}: posts some player questions per game`, () => {
			expect(PLAYER_QUESTIONS_PER_GAME[leagueSlug]).toBeGreaterThan(0)
		})
	}
})

describe("activeGameTemplates", () => {
	it("stops at the league's tier", () => {
		for (const leagueSlug of Object.keys(GAME_QUESTION_CATALOG)) {
			const tier = GENERATION_TIER[leagueSlug] ?? 0
			const active = activeGameTemplates(leagueSlug)
			expect(active.every((template) => template.tier <= tier)).toBe(true)
			expect(active).toHaveLength(
				(GAME_QUESTION_CATALOG[leagueSlug] ?? []).filter(
					(template) => template.tier <= tier,
				).length,
			)
		}
	})

	it("is empty for a league with no catalog", () => {
		expect(activeGameTemplates("wnba")).toEqual([])
	})
})

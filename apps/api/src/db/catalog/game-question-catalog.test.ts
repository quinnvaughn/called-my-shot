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

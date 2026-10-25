import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { makeLeague, makeTeam } from "../../test/factories"
import { db } from "../index"
import { teams } from "../schema"
import { syncRushmorePromptCatalog } from "./rushmore-prompts"

describe("syncRushmorePromptCatalog", () => {
	it("makes one franchise prompt per team in an active league, and running again changes nothing", async () => {
		const nba = await makeLeague({ slug: "nba" })
		const celtics = await makeTeam({
			leagueId: nba.id,
			name: "Boston Celtics",
			abbreviation: "BOS",
		})
		const off = await makeLeague({ status: "inactive" })
		await makeTeam({ leagueId: off.id })

		expect(await syncRushmorePromptCatalog()).toBe(1)
		expect(await syncRushmorePromptCatalog()).toBe(1)

		const rows = await db.query.prompts.findMany()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			code: "boston-celtics",
			title: "Boston Celtics",
			teamId: celtics.id,
			leagueId: nba.id,
			creatorId: null,
			kind: "rushmore",
		})
	})

	it("follows a rename onto the same prompt", async () => {
		const nba = await makeLeague({ slug: "nba" })
		const team = await makeTeam({
			leagueId: nba.id,
			name: "Seattle SuperSonics",
			abbreviation: "SEA",
		})
		await syncRushmorePromptCatalog()
		const before = await db.query.prompts.findFirst({
			where: { teamId: team.id },
		})

		await db
			.update(teams)
			.set({ name: "Oklahoma City Thunder", abbreviation: "OKC" })
			.where(eq(teams.id, team.id))
		await syncRushmorePromptCatalog()

		const after = await db.query.prompts.findMany({
			where: { teamId: team.id },
		})
		expect(after).toHaveLength(1)
		expect(after[0]).toMatchObject({
			id: before?.id,
			code: "oklahoma-city-thunder",
			title: "Oklahoma City Thunder",
		})
	})
})

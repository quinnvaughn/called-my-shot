import { describe, expect, it } from "vitest"
import { makeDraftEntry, makeLeague, makePrompt } from "../../test/factories"
import { db } from "../index"
import { syncRedraftPromptCatalog } from "./redraft-prompts"

describe("syncRedraftPromptCatalog", () => {
	it("makes one prompt per drafted class in an active league, and running again changes nothing", async () => {
		const nba = await makeLeague({ slug: "nba", abbreviation: "NBA" })
		await makeDraftEntry({ leagueId: nba.id, year: 2003, overall: 1 })
		await makeDraftEntry({ leagueId: nba.id, year: 2003, overall: 2 })
		// A class with only undrafted entries isn't a draft anyone can redo.
		await makeDraftEntry({ leagueId: nba.id, year: 1946 })
		const off = await makeLeague({ status: "inactive" })
		await makeDraftEntry({ leagueId: off.id, year: 2003, overall: 1 })

		expect(await syncRedraftPromptCatalog()).toBe(1)
		expect(await syncRedraftPromptCatalog()).toBe(1)

		const rows = await db.query.prompts.findMany()
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({
			kind: "redraft",
			code: "nba-2003",
			title: "2003 NBA Draft",
			leagueId: nba.id,
			draftYear: 2003,
			creatorId: null,
		})
	})

	it("shares a code with a Rushmore prompt without colliding", async () => {
		const nba = await makeLeague({ slug: "nba", abbreviation: "NBA" })
		await makePrompt({ leagueId: nba.id, code: "nba-2003", title: "NBA 2003" })
		await makeDraftEntry({ leagueId: nba.id, year: 2003, overall: 1 })
		expect(await syncRedraftPromptCatalog()).toBe(1)
		const codes = await db.query.prompts.findMany({
			columns: { kind: true, code: true },
		})
		expect(codes).toEqual(
			expect.arrayContaining([
				{ kind: "rushmore", code: "nba-2003" },
				{ kind: "redraft", code: "nba-2003" },
			]),
		)
	})
})

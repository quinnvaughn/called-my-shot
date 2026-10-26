import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { externalRefs } from "../../db/schema"
import {
	makeLeague,
	makePlayer,
	makeStint,
	makeTeam,
} from "../../test/factories"
import type { SourcePick } from "./types"
import { writeDrafts } from "./write-drafts"

async function nba() {
	const league = await makeLeague({ slug: "nba", abbreviation: "NBA" })
	const cavs = await makeTeam({
		leagueId: league.id,
		abbreviation: "CLE",
		name: "Cleveland Cavaliers",
	})
	return { league, cavs }
}

const pick = (overrides: Partial<SourcePick>): SourcePick => ({
	year: 2003,
	round: 1,
	overall: 1,
	teamAbbreviation: "CLE",
	teamName: null,
	sourceId: null,
	name: "Someone",
	...overrides,
})

const entriesOf = (leagueId: string) =>
	db.query.draftEntries.findMany({
		where: { leagueId },
		orderBy: { overall: "asc" },
	})

describe("writeDrafts", () => {
	it("links picks by ref, then by a name that started soon after, and keeps the rest as names", async () => {
		const { league, cavs } = await nba()
		const lebron = await makePlayer({ name: "LeBron James" })
		await makeStint(lebron.id, cavs.id, { firstSeason: 2004, lastSeason: 2026 })
		await db.insert(externalRefs).values({
			source: "bref",
			entityType: "player",
			entityId: lebron.id,
			sourceId: "jamesle01",
		})
		const darko = await makePlayer({ name: "Darko Miličić" })
		await makeStint(darko.id, cavs.id, { firstSeason: 2004, lastSeason: 2013 })
		// A namesake who started decades earlier isn't him.
		const elder = await makePlayer({ name: "Nobody Special" })
		await makeStint(elder.id, cavs.id, { firstSeason: 1960, lastSeason: 1962 })

		const result = await writeDrafts("nba", [
			pick({ overall: 1, sourceId: "jamesle01", name: "LeBron James" }),
			pick({ overall: 2, name: "Darko Milicic", teamName: "Detroit Pistons" }),
			pick({ overall: 3, name: "Nobody Special" }),
		])

		expect(result).toMatchObject({ picks: 3, linkedByRef: 1, linkedByName: 1 })
		const rows = await entriesOf(league.id)
		expect(
			rows
				.filter((row) => row.overall !== null)
				.map((row) => [row.overall, row.playerId, row.teamName]),
		).toEqual([
			[1, lebron.id, "Cleveland Cavaliers"],
			[2, darko.id, "Detroit Pistons"],
			[3, null, "Cleveland Cavaliers"],
		])
	})

	it("adds whoever started the season after a draft without being picked, as undrafted in that class", async () => {
		const { league, cavs } = await nba()
		const wallace = await makePlayer({ name: "Ben Wallace" })
		await makeStint(wallace.id, cavs.id, {
			firstSeason: 1997,
			lastSeason: 2012,
		})
		// Before the first class undrafted players count in.
		const early = await makePlayer({ name: "Early Guy" })
		await makeStint(early.id, cavs.id, { firstSeason: 1948, lastSeason: 1950 })

		const result = await writeDrafts("nba", [
			pick({ year: 1996, name: "Allen Iverson" }),
		])

		expect(result.undrafted).toBe(1)
		const undrafted = (await entriesOf(league.id)).filter(
			(row) => row.overall === null,
		)
		expect(undrafted).toEqual([
			expect.objectContaining({
				year: 1996,
				round: null,
				teamId: null,
				playerId: wallace.id,
				playerName: "Ben Wallace",
			}),
		])
	})

	it("puts a player drafted twice in the later class, and keeps a pick the source lists twice once", async () => {
		const { league, cavs } = await nba()
		const twice = await makePlayer({ name: "Went Back" })
		await makeStint(twice.id, cavs.id, { firstSeason: 2005, lastSeason: 2010 })
		await db.insert(externalRefs).values({
			source: "bref",
			entityType: "player",
			entityId: twice.id,
			sourceId: "backwe01",
		})

		await writeDrafts("nba", [
			pick({
				year: 2003,
				overall: 40,
				sourceId: "backwe01",
				name: "Went Back",
			}),
			pick({
				year: 2004,
				overall: 12,
				sourceId: "backwe01",
				name: "Went Back",
			}),
			pick({
				year: 2004,
				overall: 12,
				sourceId: "backwe01",
				name: "Went Back",
			}),
		])

		const rows = await entriesOf(league.id)
		expect(rows.map((row) => [row.year, row.overall, row.playerId])).toEqual([
			[2004, 12, twice.id],
			[2003, 40, null],
		])
	})

	it("replaces the league's entries on a rerun", async () => {
		const { league } = await nba()
		await writeDrafts("nba", [pick({ overall: 1 }), pick({ overall: 2 })])
		await writeDrafts("nba", [pick({ overall: 1 })])
		expect(await entriesOf(league.id)).toHaveLength(1)
	})
})

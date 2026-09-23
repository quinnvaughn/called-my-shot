import { beforeEach, describe, expect, it } from "vitest"
import {
	makeExternalRef,
	makeLeague,
	makeSeason,
	makeTeam,
} from "../../test/factories"
import { db } from "../index"
import type { EspnStandingsGroup } from "./espn-client"
import type { SyncLeagueConfig } from "./leagues"
import { syncTeamSeasonStats } from "./sync-team-season-stats"
import { type FakeEspnClient, fakeEspnClient } from "./test-support"

const NOW = new Date("2026-09-12T12:00:00Z")

let espn: FakeEspnClient
beforeEach(() => {
	espn = fakeEspnClient()
})

const config = (slug: string): SyncLeagueConfig => ({
	sportName: "Basketball",
	sportSlug: "basketball",
	leagueName: slug.toUpperCase(),
	leagueAbbreviation: slug.toUpperCase(),
	leagueSlug: slug,
	espnPath: slug === "nba" ? "basketball/nba" : "football/nfl",
})

// One team's standings row, shaped the way ESPN nests them: the scoring stats
// carry numbers, the record splits carry only display text.
function standings(
	stats: { name: string; value?: number; displayValue?: string }[],
): EspnStandingsGroup {
	return {
		children: [{ standings: { entries: [{ team: { id: "3" }, stats }] } }],
	}
}

async function seed(slug: string) {
	const league = await makeLeague({ slug })
	const season = await makeSeason({ leagueId: league.id, year: 2026 })
	const team = await makeTeam({ leagueId: league.id })
	await makeExternalRef("team", `${slug}:3`, team.id)
	return { league, season, team }
}

const run = (
	world: Awaited<ReturnType<typeof seed>>,
	slug: string,
	now = NOW,
) =>
	syncTeamSeasonStats(config(slug), world.league, world.season, {
		now,
		espn,
		spacingMs: 0,
	})

const storedFor = (teamId: string) =>
	db.query.teamSeasonStats.findFirst({ where: { teamId } })

describe("syncTeamSeasonStats", () => {
	it("stores ESPN's own scoring totals and splits", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([
				{ name: "wins", value: 2 },
				{ name: "losses", value: 0 },
				{ name: "ties", value: 0 },
				{ name: "pointsFor", value: 64 },
				{ name: "pointsAgainst", value: 40 },
				{ name: "pointDifferential", value: 24 },
				{ name: "streak", displayValue: "W2" },
				{ name: "Home", displayValue: "2-0" },
				{ name: "Road", displayValue: "0-0" },
			]),
		)

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toMatchObject({
			pointsFor: 64,
			pointsAgainst: 40,
			pointDifferential: 24,
			homeWins: 2,
			homeLosses: 0,
			roadWins: 0,
			roadLosses: 0,
			streak: "W2",
		})
	})

	// Only baseball's standings carry gamesPlayed. Football's and basketball's
	// leave it out, which stored a flat zero and had the card claiming a
	// differential measured over no games at all.
	it("falls back to the record when ESPN omits games played", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([
				{ name: "wins", value: 1 },
				{ name: "losses", value: 1 },
				{ name: "ties", value: 1 },
				{ name: "pointDifferential", value: -3 },
			]),
		)

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toMatchObject({ gamesPlayed: 3 })
	})

	it("prefers ESPN's games played where it has one", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([
				{ name: "gamesPlayed", value: 156 },
				{ name: "wins", value: 95 },
				{ name: "losses", value: 61 },
			]),
		)

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toMatchObject({ gamesPlayed: 156 })
	})

	// A tie-less split reads "28-13" and has to stay a two-part record rather
	// than picking up a NaN third.
	it("reads a split with no ties", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "Road", displayValue: "28-13" }]),
		)

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toMatchObject({
			roadWins: 28,
			roadLosses: 13,
			roadTies: 0,
		})
	})

	it("reads a split ESPN has no games for yet as zeroes", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "Home", displayValue: "-" }]),
		)

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toMatchObject({
			homeWins: 0,
			homeLosses: 0,
		})
	})

	// Basketball is the only league whose figure is a rate, so it is the only
	// one worth a second request per team.
	it("asks for possessions in basketball only", async () => {
		const nba = await seed("nba")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "pointsFor", value: 9657 }]),
		)
		espn.fetchTeamSeasonStatistics.mockResolvedValue({
			splits: {
				categories: [
					{ name: "offensive", stats: [{ name: "possessions", value: 8451 }] },
				],
			},
		})

		await run(nba, "nba")

		expect(espn.fetchTeamSeasonStatistics).toHaveBeenCalledTimes(1)
		expect(await storedFor(nba.team.id)).toMatchObject({ possessions: 8451 })
	})

	it("leaves possessions null outside basketball", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "pointsFor", value: 64 }]),
		)

		await run(world, "nfl")

		expect(espn.fetchTeamSeasonStatistics).not.toHaveBeenCalled()
		expect(await storedFor(world.team.id)).toMatchObject({ possessions: null })
	})

	// A reading is dated, and the job runs daily - so a second run on the same
	// day has to correct that day's row rather than lay down a second one.
	it("overwrites the same day's reading instead of appending", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "pointDifferential", value: 10 }]),
		)
		await run(world, "nfl")

		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "pointDifferential", value: 24 }]),
		)
		await run(world, "nfl", new Date("2026-09-12T23:00:00Z"))

		const rows = await db.query.teamSeasonStats.findMany({
			where: { teamId: world.team.id },
		})
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ pointDifferential: 24 })
	})

	it("keeps a later day as its own reading", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue(
			standings([{ name: "pointDifferential", value: 10 }]),
		)
		await run(world, "nfl")
		await run(world, "nfl", new Date("2026-09-13T12:00:00Z"))

		const rows = await db.query.teamSeasonStats.findMany({
			where: { teamId: world.team.id },
		})
		expect(rows).toHaveLength(2)
	})

	// Teams are syncTeams' to create. A standings entry for one this app has
	// never seen is skipped rather than failing the run.
	it("skips a team that was never synced", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockResolvedValue({
			children: [
				{ standings: { entries: [{ team: { id: "999" }, stats: [] }] } },
			],
		})

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toBeUndefined()
	})

	it("writes nothing when ESPN can't be reached", async () => {
		const world = await seed("nfl")
		espn.fetchStandings.mockRejectedValue(new Error("timed out"))

		await run(world, "nfl")

		expect(await storedFor(world.team.id)).toBeUndefined()
	})
})

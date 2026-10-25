import { describe, expect, it } from "vitest"
import { db } from "../../db"
import {
	makeExternalRef,
	makeLeague,
	makePlayer,
	makeTeam,
} from "../../test/factories"
import type { HistoryPlayer, HistoryStint } from "./types"
import { writeHistory } from "./write-stints"

async function seedNba() {
	const league = await makeLeague({ slug: "nba" })
	const bos = await makeTeam({ leagueId: league.id, abbreviation: "BOS" })
	const lal = await makeTeam({ leagueId: league.id, abbreviation: "LAL" })
	return { league, bos, lal }
}

const stint = (overrides: Partial<HistoryStint> = {}): HistoryStint => ({
	teamAbbreviation: "BOS",
	firstSeason: 2018,
	lastSeason: 2027,
	seasons: 10,
	games: 700,
	score: 100,
	hallOfFame: false,
	...overrides,
})

const historyPlayer = (
	overrides: Partial<HistoryPlayer> = {},
): HistoryPlayer => ({
	sourceId: "tatumja01",
	name: "Jayson Tatum",
	position: null,
	espnId: null,
	imageId: null,
	headshotUrl: null,
	active: true,
	stints: [stint()],
	...overrides,
})

const refFor = (source: "bref" | "espn", sourceId: string) =>
	db.query.externalRefs.findFirst({
		where: { source, entityType: "player", sourceId },
	})

const stintsOf = (playerId: string) =>
	db.query.playerFranchiseStints.findMany({ where: { playerId } })

describe("writeHistory", () => {
	it("links a current player by ESPN id instead of adding him again", async () => {
		const { bos } = await seedNba()
		const tatum = await makePlayer({
			name: "Jayson Tatum",
			currentTeamId: bos.id,
		})
		await makeExternalRef("player", "nba:4065648", tatum.id)

		const result = await writeHistory("nba", [
			historyPlayer({ espnId: "4065648" }),
		])

		expect(result).toMatchObject({ linkedByEspn: 1, created: 0 })
		expect((await refFor("bref", "tatumja01"))?.entityId).toBe(tatum.id)
		expect(await stintsOf(tatum.id)).toHaveLength(1)
	})

	it("links by the league CDN id in a current player's headshot", async () => {
		const { bos } = await seedNba()
		const brown = await makePlayer({
			name: "Jaylen Brown",
			currentTeamId: bos.id,
			headshotUrl:
				"https://cdn.nba.com/headshots/nba/latest/1040x760/1627759.png",
		})

		const result = await writeHistory("nba", [
			historyPlayer({
				sourceId: "brownja02",
				name: "Jaylen Brown",
				imageId: "1627759",
			}),
		])

		expect(result).toMatchObject({ linkedByImage: 1, created: 0 })
		expect((await refFor("bref", "brownja02"))?.entityId).toBe(brown.id)
	})

	it("matches by name only for an active player", async () => {
		const { bos } = await seedNba()
		const current = await makePlayer({
			name: "Chris Johnson",
			currentTeamId: bos.id,
		})

		const result = await writeHistory("nba", [
			historyPlayer({
				sourceId: "johnsch04",
				name: "Chris Johnson",
				active: true,
			}),
			historyPlayer({
				sourceId: "johnsch01",
				name: "Chris Johnson",
				active: false,
				stints: [stint({ firstSeason: 2011, lastSeason: 2011 })],
			}),
		])

		expect(result).toMatchObject({ linkedByName: 1, created: 1 })
		expect((await refFor("bref", "johnsch04"))?.entityId).toBe(current.id)
		expect((await refFor("bref", "johnsch01"))?.entityId).not.toBe(current.id)
	})

	it("reuses an earlier ingest's ref before anything else", async () => {
		await seedNba()
		const first = await writeHistory("nba", [
			historyPlayer({
				sourceId: "russebi01",
				name: "Bill Russell",
				active: false,
			}),
		])
		const second = await writeHistory("nba", [
			historyPlayer({
				sourceId: "russebi01",
				name: "Bill Russell",
				active: false,
			}),
		])
		expect(first.created).toBe(1)
		expect(second).toMatchObject({ linkedByRef: 1, created: 0 })
	})

	it("moves an earlier ref off a historical row once he's found on a roster", async () => {
		const { bos } = await seedNba()
		const first = await writeHistory("nba", [
			historyPlayer({ sourceId: "simmobe01", name: "Ben Simmons" }),
		])
		expect(first.created).toBe(1)
		const historical = (await refFor("bref", "simmobe01"))?.entityId

		const simmons = await makePlayer({
			name: "Ben Simmons",
			currentTeamId: bos.id,
		})
		await makeExternalRef("player", "nba:3907387", simmons.id)
		const second = await writeHistory("nba", [
			historyPlayer({
				sourceId: "simmobe01",
				name: "Ben Simmons",
				espnId: "3907387",
			}),
		])

		expect(second).toMatchObject({ linkedByRef: 0, linkedByEspn: 1 })
		expect((await refFor("bref", "simmobe01"))?.entityId).toBe(simmons.id)
		expect(await stintsOf(simmons.id)).toHaveLength(1)
		expect(await stintsOf(historical as string)).toHaveLength(0)
	})

	it("creates a historical player with no current team, carrying his ESPN id", async () => {
		await seedNba()
		await writeHistory("nba", [
			historyPlayer({
				sourceId: "birdla01",
				name: "Larry Bird",
				espnId: "1575",
				active: false,
				headshotUrl:
					"https://cdn.nba.com/headshots/nba/latest/1040x760/1449.png",
			}),
		])
		const ref = await refFor("bref", "birdla01")
		const bird = await db.query.players.findFirst({
			where: { id: ref?.entityId },
		})
		expect(bird).toMatchObject({ name: "Larry Bird", currentTeamId: null })
		expect(bird?.headshotUrl).toContain("1449.png")
		expect((await refFor("espn", "nba:1575"))?.entityId).toBe(bird?.id)
	})

	it("ignores an ESPN id two source players share, and one whose surname disagrees", async () => {
		const { bos } = await seedNba()
		const stephen = await makePlayer({
			name: "Stephen Curry",
			currentTeamId: bos.id,
		})
		await makeExternalRef("player", "nba:3975", stephen.id)
		const other = await makePlayer({
			name: "Someone Else",
			currentTeamId: bos.id,
		})
		await makeExternalRef("player", "nba:99", other.id)

		const result = await writeHistory("nba", [
			historyPlayer({
				sourceId: "curryst01",
				name: "Stephen Curry",
				espnId: "3975",
				active: false,
			}),
			historyPlayer({
				sourceId: "curryse01",
				name: "Seth Curry",
				espnId: "3975",
				active: false,
			}),
			historyPlayer({
				sourceId: "curryde01",
				name: "Dell Curry",
				espnId: "99",
				active: false,
			}),
		])

		expect(result).toMatchObject({ linkedByEspn: 0, created: 3 })
	})

	it("won't give a long-retired player's id match to someone on a roster now", async () => {
		const { bos } = await seedNba()
		const rookie = await makePlayer({
			name: "Blake Miller",
			currentTeamId: bos.id,
		})
		await makeExternalRef("player", "nba:5081450", rookie.id)

		const result = await writeHistory("nba", [
			historyPlayer({ sourceId: "x", name: "Tatum Filler", stints: [stint()] }),
			historyPlayer({
				sourceId: "millebl01",
				name: "Blake Miller",
				espnId: "5081450",
				active: false,
				stints: [stint({ firstSeason: 1992, lastSeason: 1992 })],
			}),
		])

		expect(result.linkedByEspn).toBe(0)
		expect((await refFor("bref", "millebl01"))?.entityId).not.toBe(rookie.id)
	})

	it("replaces the league's stints on a rerun and drops unknown teams", async () => {
		const { bos, lal } = await seedNba()
		await writeHistory("nba", [
			historyPlayer({
				sourceId: "onealsh01",
				name: "Shaquille O'Neal",
				active: false,
				stints: [
					stint({ teamAbbreviation: "LAL" }),
					stint({ teamAbbreviation: "BOS" }),
				],
			}),
		])
		const result = await writeHistory("nba", [
			historyPlayer({
				sourceId: "onealsh01",
				name: "Shaquille O'Neal",
				active: false,
				stints: [
					stint({ teamAbbreviation: "LAL", score: 900 }),
					stint({ teamAbbreviation: "SEA" }),
				],
			}),
		])
		const ref = await refFor("bref", "onealsh01")
		const rows = await stintsOf(ref?.entityId as string)
		expect(result.unknownTeams).toEqual(["SEA"])
		expect(rows.map((row) => row.teamId)).toEqual([lal.id])
		expect(rows[0]?.score).toBe(900)
		expect(rows.some((row) => row.teamId === bos.id)).toBe(false)
	})
})

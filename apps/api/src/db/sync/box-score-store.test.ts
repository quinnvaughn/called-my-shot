import { describe, expect, it } from "vitest"
import {
	HOUR,
	makeExternalRef,
	makeGame,
	makeLeague,
	makePlayer,
	makeTeam,
} from "../../test/factories"
import { espnFixture } from "../../test/helpers"
import { db } from "../index"
import { parseBoxScore } from "./box-score-parse"
import { persistBoxScore } from "./box-score-store"
import type { EspnGameSummary } from "./espn-client"

const NOW = new Date("2026-09-12T12:00:00Z")

// Same fixtures box-score-parse.test.ts reads - see there for provenance.
const summary = (league: "nba" | "nfl" | "mlb") =>
	espnFixture<EspnGameSummary>(`${league}-summary.json`)

// Each fixture's two competitors, home first.
const COMPETITORS = {
	nba: ["2", "3"],
	nfl: ["14", "25"],
	mlb: ["10", "27"],
} as const

async function seed(leagueSlug: "nba" | "nfl" | "mlb") {
	const league = await makeLeague({ slug: leagueSlug })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	const [homeEspnId, awayEspnId] = COMPETITORS[leagueSlug]
	await makeExternalRef("team", `${leagueSlug}:${homeEspnId}`, home.id)
	await makeExternalRef("team", `${leagueSlug}:${awayEspnId}`, away.id)
	const game = await makeGame({
		leagueId: league.id,
		homeTeamId: home.id,
		awayTeamId: away.id,
		startsAt: new Date(NOW.getTime() - 3 * HOUR),
		status: "final",
		finalizedAt: new Date(NOW.getTime() - 1 * HOUR),
	})

	return {
		league,
		home,
		away,
		game,
		espnTeamIdByTeamId: new Map([
			[home.id, homeEspnId],
			[away.id, awayEspnId],
		]),
	}
}

async function persist(
	setup: Awaited<ReturnType<typeof seed>>,
	leagueSlug: "nba" | "nfl" | "mlb",
	now = NOW,
) {
	return persistBoxScore({
		game: setup.game,
		leagueSlug,
		box: parseBoxScore(summary(leagueSlug)),
		espnTeamIdByTeamId: setup.espnTeamIdByTeamId,
		now,
	})
}

const playerRows = (gameId: string) =>
	db.query.playerGameStats.findMany({ where: { gameId } })
const teamRows = (gameId: string) =>
	db.query.teamGameStats.findMany({ where: { gameId } })

describe("persistBoxScore", () => {
	it("stores every athlete's every cell and stamps the game", async () => {
		const setup = await seed("nba")

		const result = await persist(setup, "nba")

		const rows = await playerRows(setup.game.id)
		expect(rows).toHaveLength(result.playerRows)
		expect(rows.length).toBeGreaterThan(0)

		const game = await db.query.games.findFirst({
			where: { id: setup.game.id },
		})
		expect(game?.boxScoreSyncedAt).toEqual(NOW)
	})

	it("parses a cell with the same function that resolves it", async () => {
		const setup = await seed("nba")
		await persist(setup, "nba")

		const rows = await playerRows(setup.game.id)
		const made = rows.find(
			(r) =>
				r.statKey === "threePointFieldGoalsMade-threePointFieldGoalsAttempted",
		)

		// The raw text is kept whole while the number is the made side only,
		// which is what the registry's parseMadeAttempted does for resolution.
		expect(made?.valueText).toMatch(/^\d+-\d+$/)
		expect(made?.valueNumeric).toBe(Number(made?.valueText.split("-")[0]))
	})

	it("keeps the team box and the player-table totals apart", async () => {
		const setup = await seed("nba")
		await persist(setup, "nba")

		const rows = await teamRows(setup.game.id)
		const scopes = new Set(rows.map((r) => r.scope))
		expect(scopes).toEqual(
			new Set(["team_box", "player_table_total", "final_score"]),
		)

		// The score isn't a box-score cell, so it's stored under its own scope
		// with a single key rather than mixed in with ESPN's columns.
		const score = rows.filter((r) => r.scope === "final_score")
		expect(score).toHaveLength(2)
		expect(score.every((r) => r.statKey === "score")).toBe(true)
		expect(score.every((r) => (r.valueNumeric ?? 0) > 0)).toBe(true)

		// NBA's two namespaces disagree on rebounds, which is the whole reason
		// the scope column exists.
		const teamBox = rows.filter((r) => r.scope === "team_box")
		const tableTotals = rows.filter((r) => r.scope === "player_table_total")
		expect(teamBox.some((r) => r.statKey === "totalRebounds")).toBe(true)
		expect(tableTotals.some((r) => r.statKey === "rebounds")).toBe(true)
	})

	it("prefixes MLB keys by table and parses innings as thirds", async () => {
		const setup = await seed("mlb")
		await persist(setup, "mlb")

		const rows = await playerRows(setup.game.id)
		expect(rows.some((r) => r.statKey === "batting.hits")).toBe(true)

		// MLB writes a partial inning as thirds after the point, so "1.2" is
		// one and two thirds, not 1.2. The stored number has to be the thirds
		// reading or every innings aggregate would be quietly wrong.
		const innings = rows.filter(
			(r) =>
				r.statKey === "pitching.fullInnings.partInnings" &&
				/^\d+\.[12]$/.test(r.valueText),
		)
		expect(innings.length).toBeGreaterThan(0)
		for (const row of innings) {
			const [full, part] = row.valueText.split(".")
			expect(row.valueNumeric).toBeCloseTo(Number(full) + Number(part) / 3, 3)
		}
	})

	it("records an athlete with no player row, without a playerId", async () => {
		const setup = await seed("nba")
		const box = parseBoxScore(summary("nba"))
		const [firstEspnAthleteId] = [...box.athletes.keys()]
		const player = await makePlayer({ currentTeamId: setup.home.id })
		await makeExternalRef("player", `nba:${firstEspnAthleteId}`, player.id)

		const result = await persist(setup, "nba")

		const rows = await playerRows(setup.game.id)
		const linked = rows.filter((r) => r.playerId === player.id)
		const unlinked = rows.filter((r) => r.playerId === null)

		expect(linked.length).toBeGreaterThan(0)
		expect(unlinked.length).toBeGreaterThan(0)
		expect(result.unlinkedAthletes).toBe(box.athletes.size - 1)
	})

	it("denormalizes each row onto the right side of the game", async () => {
		const setup = await seed("nba")
		await persist(setup, "nba")

		const rows = await playerRows(setup.game.id)
		for (const row of rows) {
			expect(row.gameDate).toEqual(setup.game.startsAt)
			expect(row.seasonId).toBe(setup.game.seasonId)
			expect(row.leagueId).toBe(setup.league.id)
			expect(row.isHome).toBe(row.teamId === setup.home.id)
			expect(row.opponentTeamId).toBe(
				row.teamId === setup.home.id ? setup.away.id : setup.home.id,
			)
		}
	})

	it("replaces a game's rows rather than accumulating them", async () => {
		const setup = await seed("nba")
		const first = await persist(setup, "nba")
		const second = await persist(setup, "nba")

		expect(second.playerRows).toBe(first.playerRows)
		expect(await playerRows(setup.game.id)).toHaveLength(first.playerRows)
		expect(await teamRows(setup.game.id)).toHaveLength(first.teamRows)
	})

	it("drops rows ESPN no longer reports on a correction", async () => {
		const setup = await seed("nba")
		await persist(setup, "nba")

		const corrected = parseBoxScore(summary("nba"))
		const [dropped] = [...corrected.athletes.keys()]
		corrected.athletes.delete(dropped)
		await persistBoxScore({
			game: setup.game,
			leagueSlug: "nba",
			box: corrected,
			espnTeamIdByTeamId: setup.espnTeamIdByTeamId,
			now: NOW,
		})

		const rows = await playerRows(setup.game.id)
		expect(rows.some((r) => r.sourceAthleteId === `nba:${dropped}`)).toBe(false)
	})

	it("stores an NFL athlete's cells from every table they appear in", async () => {
		const setup = await seed("nfl")
		await persist(setup, "nfl")

		const rows = await playerRows(setup.game.id)
		const tables = new Set(
			rows.map((r) => r.statKey.split(".")[0]).filter(Boolean),
		)

		expect(tables.size).toBeGreaterThan(1)
		expect(rows.some((r) => r.statKey.startsWith("passing."))).toBe(true)
	})
})

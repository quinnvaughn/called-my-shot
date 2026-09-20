import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HOUR, makeGame, makeLeague, makeTeam } from "../../test/factories"
import { db } from "../index"
import { externalRefs } from "../schema"
import { type EspnGameSummary, fetchGameSummary } from "./espn-client"
import { syncBoxScores } from "./sync-box-scores"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchGameSummary: vi.fn(),
}))

const NOW = new Date("2026-09-12T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * HOUR)

const nbaSummary = () =>
	JSON.parse(
		readFileSync(
			new URL("./fixtures/espn/nba-summary.json", import.meta.url),
			"utf8",
		),
	) as EspnGameSummary

async function link(
	entityType: "team" | "player" | "game",
	sourceId: string,
	entityId: string,
) {
	await db
		.insert(externalRefs)
		.values({ source: "espn", entityType, sourceId, entityId })
}

async function seedLeague() {
	const league = await makeLeague({ slug: "nba" })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	await link("team", "nba:2", home.id)
	await link("team", "nba:3", away.id)
	return { league, home, away }
}

async function seedFinalGame(
	seeded: Awaited<ReturnType<typeof seedLeague>>,
	options: { startsAt?: Date; boxScoreSyncedAt?: Date } = {},
) {
	const game = await makeGame({
		leagueId: seeded.league.id,
		homeTeamId: seeded.home.id,
		awayTeamId: seeded.away.id,
		startsAt: options.startsAt ?? daysAgo(1),
		status: "final",
		finalizedAt: options.startsAt ?? daysAgo(1),
		...(options.boxScoreSyncedAt
			? { boxScoreSyncedAt: options.boxScoreSyncedAt }
			: {}),
	})
	await link("game", `nba:${game.id}`, game.id)
	return game
}

const run = (limit?: number) =>
	syncBoxScores({ now: NOW, spacingMs: 0, ...(limit ? { limit } : {}) })

beforeEach(() => {
	vi.mocked(fetchGameSummary).mockReset()
})

describe("syncBoxScores", () => {
	it("captures a recent final game auto-resolution never fetched", async () => {
		const seeded = await seedLeague()
		const game = await seedFinalGame(seeded)
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		const result = await run()

		expect(result.captured).toBe(1)
		const stored = await db.query.games.findFirst({ where: { id: game.id } })
		expect(stored?.boxScoreSyncedAt).toEqual(NOW)
	})

	it("does nothing when every recent game is already captured", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { boxScoreSyncedAt: daysAgo(1) })

		const result = await run()

		expect(result.captured).toBe(0)
		expect(result.pending).toBe(0)
		expect(fetchGameSummary).not.toHaveBeenCalled()
	})

	// A game whose box score ESPN never completes would otherwise sit at the
	// front of the queue forever, re-fetched every tick.
	it("leaves games older than the lookback to the backfill script", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(30) })
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		const result = await run()

		expect(result.pending).toBe(0)
		expect(fetchGameSummary).not.toHaveBeenCalled()
	})

	it("works through a backlog over several runs rather than one long one", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(3) })
		await seedFinalGame(seeded, { startsAt: daysAgo(2) })
		await seedFinalGame(seeded, { startsAt: daysAgo(1) })
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		const first = await run(2)
		expect(first.captured).toBe(2)

		const second = await run(2)
		expect(second.captured).toBe(1)

		const third = await run(2)
		expect(third.captured).toBe(0)
	})
})

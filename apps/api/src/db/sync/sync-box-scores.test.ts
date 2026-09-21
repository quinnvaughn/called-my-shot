import { beforeEach, describe, expect, it } from "vitest"
import { daysAgo as daysBefore, espnFixture } from "../../test/helpers"
import { db } from "../index"
import type { EspnGameSummary } from "./espn-client"
import { syncBoxScores } from "./sync-box-scores"
import {
	type FakeEspnClient,
	fakeEspnClient,
	type NbaLeague,
	seedFinalGame as seedGame,
	seedNbaLeague as seedLeague,
} from "./test-support"

const NOW = new Date("2026-09-12T12:00:00Z")
const daysAgo = (days: number) => daysBefore(days, NOW.getTime())

const nbaSummary = () => espnFixture<EspnGameSummary>("nba-summary.json")

const seedFinalGame = (
	seeded: NbaLeague,
	options: { startsAt?: Date; boxScoreSyncedAt?: Date } = {},
) => seedGame(seeded, { startsAt: daysAgo(1), ...options })

let espn: FakeEspnClient
const run = (limit?: number) =>
	syncBoxScores({ now: NOW, spacingMs: 0, espn, ...(limit ? { limit } : {}) })

beforeEach(() => {
	espn = fakeEspnClient()
})

describe("syncBoxScores", () => {
	it("captures a recent final game auto-resolution never fetched", async () => {
		const seeded = await seedLeague()
		const game = await seedFinalGame(seeded)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

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
		expect(espn.fetchGameSummary).not.toHaveBeenCalled()
	})

	// A game whose box score ESPN never completes would otherwise sit at the
	// front of the queue forever, re-fetched every tick.
	it("leaves games older than the lookback to the backfill script", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(30) })
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		const result = await run()

		expect(result.pending).toBe(0)
		expect(espn.fetchGameSummary).not.toHaveBeenCalled()
	})

	it("works through a backlog over several runs rather than one long one", async () => {
		const seeded = await seedLeague()
		await seedFinalGame(seeded, { startsAt: daysAgo(3) })
		await seedFinalGame(seeded, { startsAt: daysAgo(2) })
		await seedFinalGame(seeded, { startsAt: daysAgo(1) })
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		const first = await run(2)
		expect(first.captured).toBe(2)

		const second = await run(2)
		expect(second.captured).toBe(1)

		const third = await run(2)
		expect(third.captured).toBe(0)
	})
})

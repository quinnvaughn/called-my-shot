import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { HOUR, makeStat } from "../../test/factories"
import { expectData } from "../../test/graphql"
import { espnFixture } from "../../test/helpers"
import { db } from "../index"
import { questions } from "../schema"
import type { EspnGameSummary } from "./espn-client"
import { CLINCH_HOLD_MS, syncLiveReadings } from "./sync-live-readings"
import {
	autoRowFor,
	type FakeEspnClient,
	fakeEspnClient,
	questionById,
	seedFinalGame,
	seedNbaLeague,
	seedPointsLine,
} from "./test-support"

const NOW = new Date("2026-09-12T12:00:00Z")

let espn: FakeEspnClient
const run = (now = NOW) => syncLiveReadings({ now, spacingMs: 0, espn })

// The nba-summary.json fixture is a finished game, but nothing here checks
// whether a box score is final, so it stands in for one still being played.
const nbaSummary = () => espnFixture<EspnGameSummary>("nba-summary.json")

async function seedGame(status: "live" | "final" | "scheduled") {
	const seeded = await seedNbaLeague()
	const game = await seedFinalGame(seeded, {
		startsAt: new Date(NOW.getTime() - HOUR),
		espnEventId: "401811029",
		status,
	})
	const stat = await makeStat({
		sportId: seeded.league.sportId,
		name: "Points",
		appliesTo: "both",
	})
	return { ...seeded, game, stat }
}

const readingFor = (questionId: string) =>
	db.query.questionLiveReadings.findFirst({ where: { questionId } })

const noticesFor = (gameId: string) =>
	db.query.notifications.findMany({ where: { gameId } })
const emailsFor = (questionId: string) =>
	db.query.emailOutbox.findMany({ where: { questionId } })

const LIVE_READING = `
	query ($id: ID!) {
		question(id: $id) {
			liveReading { value optionValues { optionId value } }
		}
	}
`

beforeEach(() => {
	espn = fakeEspnClient()
})

describe("syncLiveReadings", () => {
	it("stores where a live game's question stands", async () => {
		const setup = await seedGame("live")
		// 4869780 has 25.
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		expect(await readingFor(question.id)).toMatchObject({
			value: 25,
			optionValues: null,
			updatedAt: NOW,
		})
		const data = await expectData<{
			question: { liveReading: { value: number } | null }
		}>(LIVE_READING, { variables: { id: question.id } })
		expect(data.question.liveReading).toEqual({ value: 25, optionValues: null })
	})

	it("overwrites the reading each pass rather than adding to it", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		const later = new Date(NOW.getTime() + HOUR / 12)

		await run()
		await run(later)

		const rows = await db.query.questionLiveReadings.findMany({
			where: { questionId: question.id },
		})
		expect(rows).toHaveLength(1)
		expect(rows[0]?.updatedAt).toEqual(later)
	})

	it("keeps the last reading when the box score can't be fetched", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValueOnce(nbaSummary())
		await run()

		espn.fetchGameSummary.mockRejectedValueOnce(new Error("timeout"))
		await run(new Date(NOW.getTime() + HOUR / 12))

		expect(await readingFor(question.id)).toMatchObject({
			value: 25,
			updatedAt: NOW,
		})
	})

	it("leaves games that aren't being played alone", async () => {
		const scheduled = await seedGame("scheduled")
		await seedPointsLine(scheduled, "4869780", 22.5)
		const finalGame = await seedFinalGame(scheduled, {
			startsAt: new Date(NOW.getTime() - 4 * HOUR),
			espnEventId: null,
		})
		await seedPointsLine({ ...scheduled, game: finalGame }, "4065804", 22.5)

		await run()

		expect(espn.fetchGameSummary).not.toHaveBeenCalled()
	})

	it("hides the reading once the question settles", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run()

		await db
			.update(questions)
			.set({ status: "resolved" })
			.where(eq(questions.id, question.id))

		const data = await expectData<{
			question: { liveReading: unknown }
		}>(LIVE_READING, { variables: { id: question.id } })
		expect(data.question.liveReading).toBeNull()
	})
})

describe("syncLiveReadings settling an Over mid-game", () => {
	const held = new Date(NOW.getTime() + CLINCH_HOLD_MS)

	it("settles an Over that has held past its line", async () => {
		const setup = await seedGame("live")
		// 4869780 has 25.
		const { question, over } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()
		expect((await questionById(question.id))?.status).toBe("locked")
		expect((await readingFor(question.id))?.clinchedSince).toEqual(NOW)

		await run(held)

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(row?.resolutionMethod).toBe("system")
		expect(row?.numericActualValue).toBe(25)
		const options = await db.query.questionOptions.findMany({
			where: { questionId: question.id },
		})
		expect(options.filter((o) => o.isCorrect).map((o) => o.id)).toEqual([
			over.id,
		])
		expect(await autoRowFor(question.id)).toMatchObject({
			settledAt: held,
			awaitingFinal: true,
			recheckDueAt: null,
		})
	})

	it("tells no one until the game ends", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()
		await run(held)

		expect((await questionById(question.id))?.status).toBe("resolved")
		expect(await noticesFor(setup.game.id)).toEqual([])
		expect(await emailsFor(question.id)).toEqual([])
		expect(
			await db.query.streakRecomputeQueue.findMany({
				where: { leagueId: setup.league.id },
			}),
		).toEqual([])
	})

	it("starts the hold over when a pass sees it back under the line", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run()

		// Stands in for a replay taking the points back.
		await db
			.update(questions)
			.set({ ouLine: 30.5 })
			.where(eq(questions.id, question.id))
		await run(held)
		expect((await readingFor(question.id))?.clinchedSince).toBeNull()

		await db
			.update(questions)
			.set({ ouLine: 22.5 })
			.where(eq(questions.id, question.id))
		const later = new Date(held.getTime() + HOUR / 12)
		await run(later)

		expect((await questionById(question.id))?.status).toBe("locked")
		expect((await readingFor(question.id))?.clinchedSince).toEqual(later)
	})

	it("never settles an Under mid-game", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 30.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()
		await run(held)

		expect((await questionById(question.id))?.status).toBe("locked")
		expect((await readingFor(question.id))?.clinchedSince).toBeNull()
	})

	it("never settles a question still taking calls", async () => {
		const setup = await seedGame("live")
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		await db
			.update(questions)
			.set({ status: "open", locksAt: new Date(NOW.getTime() + HOUR) })
			.where(eq(questions.id, question.id))
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()
		await run(held)

		expect((await questionById(question.id))?.status).toBe("open")
	})
})

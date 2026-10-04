import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { HOUR, makeStat } from "../../test/factories"
import { expectData } from "../../test/graphql"
import { espnFixture } from "../../test/helpers"
import { db } from "../index"
import { questions } from "../schema"
import type { EspnGameSummary } from "./espn-client"
import { syncLiveReadings } from "./sync-live-readings"
import {
	type FakeEspnClient,
	fakeEspnClient,
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

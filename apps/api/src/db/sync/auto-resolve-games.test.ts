import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RECHECK_DELAY_MS } from "../../lib/auto-resolve/apply"
import {
	HOUR,
	makeCall,
	makeExternalRef,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSelection,
	makeStat,
	makeUser,
} from "../../test/factories"
import { espnFixture } from "../../test/helpers"
import { db } from "../index"
import { games } from "../schema"
import { autoResolveGames } from "./auto-resolve-games"
import { persistBoxScore } from "./box-score-store"
import { type EspnGameSummary, EspnRequestError } from "./espn-client"
import { resolveGameWinner } from "./sync-games"
import { CLINCH_HOLD_MS, syncLiveReadings } from "./sync-live-readings"
import {
	autoRowFor,
	type FakeEspnClient,
	fakeEspnClient,
	type NbaSummaryGame,
	questionById,
	seedNbaSummaryGame,
	seedPointsLine,
} from "./test-support"

// Calls through by default - only the "persisting fails" case overrides it,
// and with mockRejectedValueOnce, so nothing has to put the real one back.
vi.mock("./box-score-store", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./box-score-store")>()
	return { ...actual, persistBoxScore: vi.fn(actual.persistBoxScore) }
})

const NOW = new Date("2026-09-12T12:00:00Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR)

let espn: FakeEspnClient
const run = (now = NOW) => autoResolveGames({ now, spacingMs: 0, espn })

// See box-score-parse.test.ts for where the fixture comes from.
const nbaSummary = () => espnFixture<EspnGameSummary>("nba-summary.json")

const seedNbaGame = (finalizedHoursAgo = 2) =>
	seedNbaSummaryGame(
		hoursAgo(finalizedHoursAgo + 3),
		hoursAgo(finalizedHoursAgo),
	)

const correctOptionIds = async (questionId: string) =>
	(await db.query.questionOptions.findMany({ where: { questionId } }))
		.filter((o) => o.isCorrect)
		.map((o) => o.id)

beforeEach(() => {
	espn = fakeEspnClient()
})

describe("autoResolveGames box score capture", () => {
	it("stores the box score it already fetched to resolve", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		const rows = await db.query.playerGameStats.findMany({
			where: { gameId: setup.game.id },
		})
		const game = await db.query.games.findFirst({
			where: { id: setup.game.id },
		})

		expect(rows.length).toBeGreaterThan(0)
		expect(game?.boxScoreSyncedAt).toEqual(NOW)
	})

	// Resolution is the critical path and stat context is not, so a bad row
	// must never cost a caller their result.
	it("still resolves the question when storing the box score fails", async () => {
		const setup = await seedNbaGame()
		const { question, over } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		vi.mocked(persistBoxScore).mockRejectedValueOnce(new Error("nope"))

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(await correctOptionIds(question.id)).toEqual([over.id])

		const game = await db.query.games.findFirst({
			where: { id: setup.game.id },
		})
		expect(game?.boxScoreSyncedAt).toBeNull()
	})
})

describe("autoResolveGames", () => {
	it("resolves a finished game's question from the box score", async () => {
		const setup = await seedNbaGame()
		// 4869780 scored 25.
		const { question, over } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(row?.resolutionMethod).toBe("system")
		expect(row?.resolutionSource).toBe("ESPN box score")
		expect(row?.resolutionSourceUrl).toBe(
			"https://www.espn.com/nba/boxscore/_/gameId/401811029",
		)
		expect(await correctOptionIds(question.id)).toEqual([over.id])
		expect((await autoRowFor(question.id))?.recheckDueAt?.getTime()).toBe(
			NOW.getTime() + RECHECK_DELAY_MS,
		)
	})

	it("resolves a game that has only just gone final", async () => {
		const setup = await seedNbaGame(0)
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		expect((await questionById(question.id))?.status).toBe("resolved")
	})

	it("waits on a box score ESPN hasn't finished", async () => {
		const setup = await seedNbaGame(0)
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		const partial = nbaSummary()
		partial.header.competitions[0].boxscoreSource = "basic"
		espn.fetchGameSummary.mockResolvedValue(partial)

		await run()

		expect((await questionById(question.id))?.status).toBe("locked")
		const auto = await autoRowFor(question.id)
		expect(auto?.failureReason).toBe("box_score_not_final")
		expect(auto?.nextAttemptAt).not.toBeNull()
	})

	it("voids the question when the player didn't play", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "3442", 10.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("voided")
		expect(row?.voidedReason).toBe("subject_did_not_play")
	})

	it("voids a tied head-to-head as a push, scoring no call", async () => {
		const setup = await seedNbaGame()
		const rebounds = await makeStat({
			sportId: setup.league.sportId,
			name: "Rebounds",
			appliesTo: "both",
		})
		// 3155535 and 4065804 both had 6 rebounds.
		const question = await makeQuestion({
			shape: "player_vs_player",
			leagueId: setup.league.id,
			sportId: setup.league.sportId,
			seasonId: setup.game.seasonId,
			gameId: setup.game.id,
			statId: rebounds.id,
			status: "locked",
			locksAt: setup.game.startsAt,
			resolutionMode: "system",
		})
		const options = []
		for (const [sortOrder, espnAthleteId] of ["3155535", "4065804"].entries()) {
			const player = await makePlayer({ currentTeamId: setup.away.id })
			await makeExternalRef("player", `nba:${espnAthleteId}`, player.id)
			options.push(
				await makeOption(question.id, {
					label: player.name,
					sortOrder,
					playerId: player.id,
				}),
			)
		}
		const caller = await makeUser()
		const call = await makeCall(question.id, caller.id)
		const [first] = options
		if (!first) throw new Error("expected options")
		await makeSelection(call.id, first.id)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("voided")
		expect(row?.voidedReason).toBe("tie")
		expect(row?.resolutionNote).toContain("both sides finished level")
		const scored = await db.query.calls.findFirst({ where: { id: call.id } })
		expect(scored?.unscoredReason).toBe("question_voided")
	})

	it("reads the box score once for every question on the game", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5)
		await seedPointsLine(setup, "4065804", 20.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())

		await run()

		expect(espn.fetchGameSummary).toHaveBeenCalledTimes(1)
	})

	it("leaves a question a person resolves alone", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5, "manual")
		await run()
		expect(espn.fetchGameSummary).not.toHaveBeenCalled()
	})

	it("retries a failed fetch, then hands the question to an admin", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockRejectedValue(new Error("timed out"))

		await run()
		const first = await autoRowFor(question.id)
		expect(first?.failureReason).toBe("fetch_failed")
		expect(first?.escalatedAt).toBeNull()
		expect(first?.nextAttemptAt).not.toBeNull()

		await run(new Date(hoursAgo(2).getTime() + 13 * HOUR))
		expect((await autoRowFor(question.id))?.escalatedAt).not.toBeNull()
		expect((await questionById(question.id))?.status).toBe("locked")
	})

	it("stops the run when ESPN refuses it", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockRejectedValue(
			new EspnRequestError("summary", 429),
		)
		await expect(run()).rejects.toBeInstanceOf(EspnRequestError)
	})
})

describe("autoResolveGames - re-check", () => {
	const afterRecheck = new Date(NOW.getTime() + RECHECK_DELAY_MS + HOUR)

	it("re-scores the question when ESPN corrected the box score", async () => {
		const setup = await seedNbaGame()
		const { question, under } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run()

		const corrected = nbaSummary()
		for (const team of corrected.boxscore?.players ?? []) {
			for (const table of team.statistics) {
				const pointsIndex = table.keys.indexOf("points")
				for (const entry of table.athletes) {
					if (entry.athlete.id === "4869780") entry.stats[pointsIndex] = "20"
				}
			}
		}
		espn.fetchGameSummary.mockResolvedValue(corrected)
		await run(afterRecheck)

		expect(await correctOptionIds(question.id)).toEqual([under.id])
		expect((await autoRowFor(question.id))?.recheckedAt).not.toBeNull()
	})

	it("re-checks a matchup the final score settled, and corrects it", async () => {
		const setup = await seedNbaGame()
		const { game } = setup
		const question = await makeQuestion({
			shape: "team_vs_team",
			leagueId: setup.league.id,
			sportId: setup.league.sportId,
			seasonId: game.seasonId,
			gameId: game.id,
			status: "locked",
			locksAt: game.startsAt,
			resolutionMode: "system",
		})
		const home = await makeOption(question.id, {
			label: "Home",
			sortOrder: 0,
			teamId: game.homeTeamId,
		})
		const away = await makeOption(question.id, {
			label: "Away",
			sortOrder: 1,
			teamId: game.awayTeamId,
		})

		// The scoreboard had the away team winning; the box score has the home
		// team winning 144-118.
		await db.transaction((tx) =>
			resolveGameWinner(
				tx,
				game.id,
				game.homeTeamId,
				game.awayTeamId,
				100,
				110,
				NOW,
			),
		)
		expect(await correctOptionIds(question.id)).toEqual([away.id])
		expect((await autoRowFor(question.id))?.recheckDueAt?.getTime()).toBe(
			NOW.getTime() + RECHECK_DELAY_MS,
		)

		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run(afterRecheck)

		expect(await correctOptionIds(question.id)).toEqual([home.id])
		expect((await autoRowFor(question.id))?.recheckedAt).not.toBeNull()
	})

	it("changes nothing when the box score still says the same", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run()
		const notificationsAfterFirst = (
			await db.query.notifications.findMany({
				where: { questionId: question.id },
			})
		).length

		await run(afterRecheck)

		expect(
			(
				await db.query.notifications.findMany({
					where: { questionId: question.id },
				})
			).length,
		).toBe(notificationsAfterFirst)
		expect((await autoRowFor(question.id))?.recheckedAt).not.toBeNull()
	})
})

describe("autoResolveGames - final read of a question settled mid-game", () => {
	// The fixture with 4869780's points set to `points`.
	const summaryWithPoints = (points: number) => {
		const summary = nbaSummary()
		for (const team of summary.boxscore?.players ?? []) {
			for (const table of team.statistics) {
				const pointsIndex = table.keys.indexOf("points")
				for (const entry of table.athletes) {
					if (entry.athlete.id === "4869780") {
						entry.stats[pointsIndex] = String(points)
					}
				}
			}
		}
		return summary
	}

	// Settles the line from the live job while the game is on, then ends it.
	async function settleMidGame(setup: NbaSummaryGame, livePoints: number) {
		const setStatus = (status: "live" | "final") =>
			db.update(games).set({ status }).where(eq(games.id, setup.game.id))
		await setStatus("live")
		espn.fetchGameSummary.mockResolvedValue(summaryWithPoints(livePoints))
		const mid = hoursAgo(3)
		await syncLiveReadings({ now: mid, spacingMs: 0, espn })
		await syncLiveReadings({
			now: new Date(mid.getTime() + CLINCH_HOLD_MS),
			spacingMs: 0,
			espn,
		})
		await setStatus("final")
	}

	it("writes in the numbers the game finished with", async () => {
		const setup = await seedNbaGame()
		const { question, over } = await seedPointsLine(setup, "4869780", 22.5)
		await settleMidGame(setup, 23)
		expect((await questionById(question.id))?.numericActualValue).toBe(23)

		espn.fetchGameSummary.mockResolvedValue(nbaSummary())
		await run()

		expect((await questionById(question.id))?.numericActualValue).toBe(25)
		expect(await correctOptionIds(question.id)).toEqual([over.id])
		expect(await autoRowFor(question.id)).toMatchObject({
			awaitingFinal: false,
			recheckDueAt: new Date(NOW.getTime() + RECHECK_DELAY_MS),
			recheckedAt: null,
		})
	})

	it("re-settles when the final box score takes the Over back", async () => {
		const setup = await seedNbaGame()
		const { question, under } = await seedPointsLine(setup, "4869780", 22.5)
		await settleMidGame(setup, 23)

		espn.fetchGameSummary.mockResolvedValue(summaryWithPoints(20))
		await run()

		expect(await correctOptionIds(question.id)).toEqual([under.id])
		expect((await autoRowFor(question.id))?.awaitingFinal).toBe(false)
	})

	it("waits on a final box score ESPN hasn't finished", async () => {
		const setup = await seedNbaGame(0)
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		await settleMidGame(setup, 23)

		const partial = nbaSummary()
		partial.header.competitions[0].boxscoreSource = "basic"
		espn.fetchGameSummary.mockResolvedValue(partial)
		await run()

		expect((await questionById(question.id))?.numericActualValue).toBe(23)
		const auto = await autoRowFor(question.id)
		expect(auto?.awaitingFinal).toBe(true)
		expect(auto?.nextAttemptAt?.getTime()).toBeGreaterThan(NOW.getTime())
	})
})

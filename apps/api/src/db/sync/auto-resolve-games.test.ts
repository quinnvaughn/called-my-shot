import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RECHECK_DELAY_MS } from "../../lib/auto-resolve/apply"
import {
	HOUR,
	makeCall,
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSelection,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { db } from "../index"
import { externalRefs } from "../schema"
import { autoResolveGames } from "./auto-resolve-games"
import {
	type EspnGameSummary,
	EspnRequestError,
	fetchCompetitorAthleteStatistics,
	fetchCompetitorRoster,
	fetchGameSummary,
} from "./espn-client"
import { resolveGameWinner } from "./sync-games"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchGameSummary: vi.fn(),
	fetchCompetitorRoster: vi.fn(),
	fetchCompetitorAthleteStatistics: vi.fn(),
}))

const NOW = new Date("2026-09-12T12:00:00Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR)
const run = (now = NOW) => autoResolveGames({ now, spacingMs: 0 })

// See box-score-parse.test.ts for where the fixture comes from.
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

// The fixture's game: home team "2", away team "3", event 401811029.
async function seedNbaGame(finalizedHoursAgo = 2) {
	const league = await makeLeague({ slug: "nba" })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	await link("team", "nba:2", home.id)
	await link("team", "nba:3", away.id)
	const game = await makeGame({
		leagueId: league.id,
		homeTeamId: home.id,
		awayTeamId: away.id,
		startsAt: hoursAgo(finalizedHoursAgo + 3),
		status: "final",
		finalizedAt: hoursAgo(finalizedHoursAgo),
	})
	await link("game", "nba:401811029", game.id)
	const stat = await makeStat({
		sportId: league.sportId,
		name: "Points",
		appliesTo: "both",
	})
	return { league, away, game, stat }
}

type Setup = Awaited<ReturnType<typeof seedNbaGame>>

async function seedPointsLine(
	setup: Setup,
	espnAthleteId: string,
	ouLine: number,
	resolutionMode: "system" | "manual" = "system",
) {
	const player = await makePlayer({ currentTeamId: setup.away.id })
	await link("player", `nba:${espnAthleteId}`, player.id)
	const question = await makeQuestion({
		shape: "player_stat_over_under",
		leagueId: setup.league.id,
		sportId: setup.league.sportId,
		seasonId: setup.game.seasonId,
		gameId: setup.game.id,
		statId: setup.stat.id,
		subjectPlayerId: player.id,
		ouLine,
		status: "locked",
		locksAt: setup.game.startsAt,
		resolutionMode,
	})
	const over = await makeOption(question.id, { label: "Over", sortOrder: 0 })
	const under = await makeOption(question.id, { label: "Under", sortOrder: 1 })
	const caller = await makeUser()
	const call = await makeCall(question.id, caller.id)
	await makeSelection(call.id, over.id)
	return { question, over, under }
}

const questionById = (id: string) =>
	db.query.questions.findFirst({ where: { id } })
const autoRowFor = (questionId: string) =>
	db.query.questionAutoResolutions.findFirst({ where: { questionId } })
const correctOptionIds = async (questionId: string) =>
	(await db.query.questionOptions.findMany({ where: { questionId } }))
		.filter((o) => o.isCorrect)
		.map((o) => o.id)

beforeEach(() => {
	vi.mocked(fetchGameSummary).mockReset()
	vi.mocked(fetchCompetitorRoster).mockReset()
	vi.mocked(fetchCompetitorAthleteStatistics).mockReset()
})

describe("autoResolveGames", () => {
	it("resolves a finished game's question from the box score", async () => {
		const setup = await seedNbaGame()
		// 4869780 scored 25.
		const { question, over } = await seedPointsLine(setup, "4869780", 22.5)
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

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
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		await run()

		expect((await questionById(question.id))?.status).toBe("resolved")
	})

	it("waits on a box score ESPN hasn't finished", async () => {
		const setup = await seedNbaGame(0)
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		const partial = nbaSummary()
		partial.header.competitions[0].boxscoreSource = "basic"
		vi.mocked(fetchGameSummary).mockResolvedValue(partial)

		await run()

		expect((await questionById(question.id))?.status).toBe("locked")
		const auto = await autoRowFor(question.id)
		expect(auto?.failureReason).toBe("box_score_not_final")
		expect(auto?.nextAttemptAt).not.toBeNull()
	})

	it("voids the question when the player didn't play", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "3442", 10.5)
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

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
			await link("player", `nba:${espnAthleteId}`, player.id)
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
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("voided")
		expect(row?.voidedReason).toBe("tie")
		const scored = await db.query.calls.findFirst({ where: { id: call.id } })
		expect(scored?.unscoredReason).toBe("question_voided")
	})

	it("reads the box score once for every question on the game", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5)
		await seedPointsLine(setup, "4065804", 20.5)
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())

		await run()

		expect(fetchGameSummary).toHaveBeenCalledTimes(1)
	})

	it("leaves a question a person resolves alone", async () => {
		const setup = await seedNbaGame()
		await seedPointsLine(setup, "4869780", 22.5, "manual")
		await run()
		expect(fetchGameSummary).not.toHaveBeenCalled()
	})

	it("retries a failed fetch, then hands the question to an admin", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		vi.mocked(fetchGameSummary).mockRejectedValue(new Error("timed out"))

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
		vi.mocked(fetchGameSummary).mockRejectedValue(
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
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())
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
		vi.mocked(fetchGameSummary).mockResolvedValue(corrected)
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

		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())
		await run(afterRecheck)

		expect(await correctOptionIds(question.id)).toEqual([home.id])
		expect((await autoRowFor(question.id))?.recheckedAt).not.toBeNull()
	})

	it("changes nothing when the box score still says the same", async () => {
		const setup = await seedNbaGame()
		const { question } = await seedPointsLine(setup, "4869780", 22.5)
		vi.mocked(fetchGameSummary).mockResolvedValue(nbaSummary())
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

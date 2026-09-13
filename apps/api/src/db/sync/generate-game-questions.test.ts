import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OFFICIAL_ACCOUNT_USERNAME } from "../../lib/official-account"
import {
	HOUR,
	makeCall,
	makeGame,
	makeLeague,
	makePlayer,
	makeSeason,
	makeStat,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { db } from "../index"
import {
	externalRefs,
	gameStarters,
	games,
	type League,
	type Question,
	type Team,
} from "../schema"
import {
	type EspnSeasonStatistics,
	fetchAthleteSeasonStatistics,
} from "./espn-client"
import { gamesInWindow, generateGameQuestions } from "./generate-game-questions"
import { syncGameQuestions } from "./sync-game-questions"

vi.mock("./espn-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("./espn-client")>()),
	fetchAthleteSeasonStatistics: vi.fn(),
}))

const NOW = new Date("2026-11-10T16:00:00Z")
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR)

const run = () => generateGameQuestions({ now: NOW, spacingMs: 0 })

// ESPN season statistics by athlete id, then season year.
let seasonStats: Record<string, Record<number, EspnSeasonStatistics>> = {}

function nbaSeason(pointsPerGame: number, gamesPlayed: number) {
	return {
		splits: {
			categories: [
				{
					name: "offensive",
					stats: [{ name: "points", value: pointsPerGame * gamesPlayed }],
				},
				{
					name: "general",
					stats: [{ name: "gamesPlayed", value: gamesPlayed }],
				},
			],
		},
	}
}

beforeEach(() => {
	seasonStats = {}
	vi.mocked(fetchAthleteSeasonStatistics).mockReset()
	vi.mocked(fetchAthleteSeasonStatistics).mockImplementation(
		async (_sportPath, year, espnAthleteId) =>
			seasonStats[espnAthleteId]?.[year] ?? null,
	)
})

async function seedNbaGame(hoursUntilStart = 10) {
	await makeUser({ username: OFFICIAL_ACCOUNT_USERNAME })
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id, year: 2027 })
	const points = await makeStat({ sportId: league.sportId, name: "Points" })
	await makeStat({
		sportId: league.sportId,
		name: "Rebounds",
		toleranceTierId: points.toleranceTierId,
	})
	const away = await makeTeam({ leagueId: league.id, name: "Knicks" })
	const home = await makeTeam({ leagueId: league.id, name: "Celtics" })
	const game = await makeGame({
		leagueId: league.id,
		seasonId: season.id,
		homeTeamId: home.id,
		awayTeamId: away.id,
		startsAt: hoursFromNow(hoursUntilStart),
	})
	return { league, away, home, game }
}

async function addStarter(
	league: League,
	gameId: string,
	team: Team,
	starter: {
		name: string
		espnId: string
		sortOrder: number
		seasons: Record<number, EspnSeasonStatistics>
	},
) {
	const player = await makePlayer({
		name: starter.name,
		currentTeamId: team.id,
	})
	await db.insert(externalRefs).values({
		source: "espn",
		entityType: "player",
		sourceId: `${league.slug}:${starter.espnId}`,
		entityId: player.id,
	})
	await db.insert(gameStarters).values({
		gameId,
		teamId: team.id,
		playerId: player.id,
		role: "starter",
		sortOrder: starter.sortOrder,
		playerName: starter.name,
		position: "G",
	})
	seasonStats[starter.espnId] = starter.seasons
	return player
}

// Two starters a side. The Knicks' top scorer is listed second on the depth
// chart, so ranking has to reorder them.
async function seedStandardGame() {
	const seeded = await seedNbaGame()
	const { league, away, home, game } = seeded
	await addStarter(league, game.id, away, {
		name: "Josh Hart",
		espnId: "1",
		sortOrder: 1,
		seasons: { 2027: nbaSeason(10, 20) },
	})
	await addStarter(league, game.id, away, {
		name: "Jalen Brunson",
		espnId: "2",
		sortOrder: 2,
		seasons: { 2027: nbaSeason(28, 20) },
	})
	await addStarter(league, game.id, home, {
		name: "Jayson Tatum",
		espnId: "3",
		sortOrder: 1,
		seasons: { 2027: nbaSeason(27, 20) },
	})
	await addStarter(league, game.id, home, {
		name: "Jaylen Brown",
		espnId: "4",
		sortOrder: 2,
		seasons: { 2027: nbaSeason(23, 20) },
	})
	return seeded
}

const questionsOn = (gameId: string) =>
	db.query.questions.findMany({
		where: { gameId },
		with: {
			subjectPlayer: true,
			options: { orderBy: { sortOrder: "asc" } },
		},
	})

const shapeCounts = (questions: Question[]) =>
	questions.reduce<Record<string, number>>((counts, question) => {
		counts[question.shape] = (counts[question.shape] ?? 0) + 1
		return counts
	}, {})

const overUnderSubjects = (
	questions: Awaited<ReturnType<typeof questionsOn>>,
) =>
	questions
		.filter((question) => question.shape === "player_stat_over_under")
		.map((question) => question.subjectPlayer?.name)
		.sort()

const markOut = (playerName: string) =>
	db
		.update(gameStarters)
		.set({ injuryStatus: "Out" })
		.where(eq(gameStarters.playerName, playerName))

describe("generateGameQuestions", () => {
	it("posts each NBA template on a game in the window, and nothing more on a rerun", async () => {
		const { game } = await seedStandardGame()

		await run()
		const posted = await questionsOn(game.id)

		expect(shapeCounts(posted)).toEqual({
			team_stat_numeric_guess: 2,
			player_vs_player: 1,
			player_stat_over_under: 2,
			player_game_stat_leader: 1,
		})
		for (const question of posted) {
			expect(question.isOfficial).toBe(true)
			expect(question.resolutionMode).toBe("system")
			expect(question.locksAt.getTime()).toBe(game.startsAt.getTime())
			expect(question.generationKey).not.toBeNull()
		}

		const duel = posted.find((q) => q.shape === "player_vs_player")
		expect(duel?.options.map((o) => o.label)).toEqual([
			"Jalen Brunson",
			"Jayson Tatum",
		])

		const lines = posted
			.filter((q) => q.shape === "player_stat_over_under")
			.map((q) => [q.subjectPlayer?.name, q.ouLine, q.lineBasis?.blendedMean])
			.sort()
		expect(lines).toEqual([
			["Jalen Brunson", 27.5, 28],
			["Jayson Tatum", 26.5, 27],
		])

		const leader = posted.find((q) => q.shape === "player_game_stat_leader")
		expect(leader?.options).toHaveLength(4)

		const guess = posted.find((q) => q.shape === "team_stat_numeric_guess")
		expect(guess?.numericTolerancePct).toBe(0.1)

		await run()
		expect(await questionsOn(game.id)).toHaveLength(6)
	})

	it("posts only the team guesses before any starters are listed", async () => {
		const { game } = await seedNbaGame()

		await run()

		expect(shapeCounts(await questionsOn(game.id))).toEqual({
			team_stat_numeric_guess: 2,
		})
	})

	it("leaves games outside the window alone", async () => {
		const { league, away, home } = await seedStandardGame()
		const tooFar = await makeGame({
			leagueId: league.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			startsAt: hoursFromNow(40),
		})
		const tooSoon = await makeGame({
			leagueId: league.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			startsAt: hoursFromNow(0.5),
		})

		await run()

		expect(await questionsOn(tooFar.id)).toHaveLength(0)
		expect(await questionsOn(tooSoon.id)).toHaveLength(0)
	})

	it("sets a line from last season while this one is short", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await addStarter(league, game.id, away, {
			name: "Jalen Brunson",
			espnId: "2",
			sortOrder: 1,
			seasons: { 2027: nbaSeason(28, 20) },
		})
		await addStarter(league, game.id, home, {
			name: "Jayson Tatum",
			espnId: "3",
			sortOrder: 1,
			seasons: { 2027: nbaSeason(40, 2), 2026: nbaSeason(25, 80) },
		})

		await run()

		const tatum = (await questionsOn(game.id)).find(
			(q) =>
				q.shape === "player_stat_over_under" &&
				q.subjectPlayer?.name === "Jayson Tatum",
		)
		expect(tatum?.ouLine).toBe(26.5)
		expect(tatum?.lineBasis).toMatchObject({
			seasonGames: 2,
			priorGames: 80,
			blendedMean: 27.5,
		})
	})

	it("posts no over/under for a team whose starters haven't played enough", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await addStarter(league, game.id, away, {
			name: "Rookie Guard",
			espnId: "9",
			sortOrder: 1,
			seasons: { 2027: nbaSeason(18, 3) },
		})
		await addStarter(league, game.id, home, {
			name: "Jayson Tatum",
			espnId: "3",
			sortOrder: 1,
			seasons: { 2027: nbaSeason(27, 20) },
		})

		await run()
		const posted = await questionsOn(game.id)

		expect(overUnderSubjects(posted)).toEqual(["Jayson Tatum"])
		expect(posted.some((q) => q.shape === "player_vs_player")).toBe(true)
	})

	it("moves a ruled-out starter's uncalled questions to the next starter up", async () => {
		const { game } = await seedStandardGame()
		await run()

		await markOut("Jayson Tatum")
		await run()
		const posted = await questionsOn(game.id)

		expect(posted).toHaveLength(6)
		expect(
			posted.find((q) => q.shape === "player_vs_player")?.options.map((o) => o.label),
		).toEqual(["Jalen Brunson", "Jaylen Brown"])
		expect(overUnderSubjects(posted)).toEqual(["Jalen Brunson", "Jaylen Brown"])
	})

	it("keeps a called question about a ruled-out starter up beside its replacement", async () => {
		const { game } = await seedStandardGame()
		await run()
		const tatumLine = (await questionsOn(game.id)).find(
			(q) =>
				q.shape === "player_stat_over_under" &&
				q.subjectPlayer?.name === "Jayson Tatum",
		)
		if (!tatumLine) throw new Error("expected a Tatum over/under")
		const caller = await makeUser()
		await makeCall(tatumLine.id, caller.id)

		await markOut("Jayson Tatum")
		await run()

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Jalen Brunson",
			"Jaylen Brown",
			"Jayson Tatum",
		])
	})
})

describe("syncGameQuestions", () => {
	it("carries every generated question on a moved game to its new start", async () => {
		const { league, game } = await seedStandardGame()
		await run()

		const movedTo = hoursFromNow(34)
		await db
			.update(games)
			.set({ startsAt: movedTo })
			.where(eq(games.id, game.id))
		await syncGameQuestions(league)

		const posted = await questionsOn(game.id)
		expect(posted).toHaveLength(7)
		for (const question of posted) {
			expect(question.locksAt.getTime()).toBe(movedTo.getTime())
			expect(question.title).toMatch(/\(Nov 11\)$/)
		}
	})
})

describe("gamesInWindow", () => {
	const nflGame = (hours: number, weekNumber: number | null) => ({
		startsAt: hoursFromNow(hours),
		seasonId: "season",
		seasonType: "regular" as const,
		weekNumber,
	})

	it("takes the whole week the next NFL game belongs to", () => {
		const thursday = nflGame(2, 3)
		const sunday = nflGame(74, 3)
		const nextWeek = nflGame(170, 4)
		expect(
			gamesInWindow([nextWeek, sunday, thursday], { kind: "week" }, NOW),
		).toEqual([thursday, sunday])
	})

	it("leaves out a game about to start", () => {
		const aboutToStart = nflGame(0.5, 3)
		const later = nflGame(3, 3)
		expect(
			gamesInWindow([aboutToStart, later], { kind: "week" }, NOW),
		).toEqual([later])
	})

	it("takes the hours ahead for a daily league", () => {
		const tonight = nflGame(10, null)
		const dayAfter = nflGame(40, null)
		expect(
			gamesInWindow([dayAfter, tonight], { kind: "ahead", ms: 30 * HOUR }, NOW),
		).toEqual([tonight])
	})
})

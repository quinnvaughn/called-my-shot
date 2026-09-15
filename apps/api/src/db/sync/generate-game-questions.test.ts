import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { parseGenerationKey } from "../../lib/game-questions/generation-key"
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
import {
	GAME_QUESTION_CATALOG,
	type GameQuestionTemplate,
	PLAYER_QUESTIONS_PER_GAME,
} from "../catalog/game-question-catalog"
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

const catalogTemplate = (leagueSlug: string, id: string) => {
	const template = GAME_QUESTION_CATALOG[leagueSlug]?.find((t) => t.id === id)
	if (!template) throw new Error(`no ${leagueSlug} template ${id}`)
	return template
}

const TEAM_POINTS = catalogTemplate("nba", "team-points")
const POINTS_DUEL = catalogTemplate("nba", "top-scorer-points-duel")
const POINTS_LINE = catalogTemplate("nba", "top-scorer-points")
const REBOUNDS_LEADER = catalogTemplate("nba", "rebounds-leader")
const POINTS_LEADER = catalogTemplate("nba", "points-leader")
const BATTER_HITS = catalogTemplate("mlb", "batter-hits")

// With templates, posts exactly those on the league's games, each in a group
// of its own so none is left out. Without, posts what the catalog draws.
const run = (templates?: GameQuestionTemplate[], leagueSlug = "nba") =>
	generateGameQuestions({
		now: NOW,
		spacingMs: 0,
		catalog: templates
			? {
					templates: {
						[leagueSlug]: templates.map((template) =>
							"group" in template ? { ...template, group: template.id } : template,
						),
					},
					playerQuestionsPerGame: { [leagueSlug]: templates.length },
				}
			: {},
	})

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

function mlbBattingSeason(hitsPerGame: number, gamesPlayed: number) {
	return {
		splits: {
			categories: [
				{
					name: "batting",
					stats: [
						{ name: "hits", value: hitsPerGame * gamesPlayed },
						{ name: "gamesPlayed", value: gamesPlayed },
					],
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

async function addPlayer(
	league: League,
	team: Team,
	player: {
		name: string
		espnId: string
		positions?: string[]
		seasons: Record<number, EspnSeasonStatistics>
	},
) {
	const row = await makePlayer({
		name: player.name,
		currentTeamId: team.id,
		positions: player.positions ?? [],
	})
	await db.insert(externalRefs).values({
		source: "espn",
		entityType: "player",
		sourceId: `${league.slug}:${player.espnId}`,
		entityId: row.id,
	})
	seasonStats[player.espnId] = player.seasons
	return row
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
	const player = await addPlayer(league, team, starter)
	await db.insert(gameStarters).values({
		gameId,
		teamId: team.id,
		playerId: player.id,
		role: "starter",
		sortOrder: starter.sortOrder,
		playerName: starter.name,
		position: "G",
	})
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

const duelPlayers = (questions: Awaited<ReturnType<typeof questionsOn>>) =>
	questions
		.find((question) => question.shape === "player_vs_player")
		?.options.map((option) => option.label)

const markOut = (playerName: string) =>
	db
		.update(gameStarters)
		.set({ injuryStatus: "Out" })
		.where(eq(gameStarters.playerName, playerName))

describe("generateGameQuestions", () => {
	it("records a leader question's favorite and saves its loss rate", async () => {
		const { game } = await seedStandardGame()

		await run([POINTS_LEADER])

		const leader = (await questionsOn(game.id)).find(
			(q) => q.shape === "player_game_stat_leader",
		)
		const brunson = leader?.options.find((o) => o.label === "Jalen Brunson")
		expect(leader?.leaderBasis).toEqual({
			favoritePlayerId: brunson?.playerId,
			favoriteMean: 28,
			contenders: 4,
		})
		expect(leader?.lossRate).toBe(LOSS_RATE_BY_SHAPE.player_game_stat_leader)
	})

	it("posts each template on a game in the window, and nothing more on a rerun", async () => {
		const { game } = await seedStandardGame()

		await run([TEAM_POINTS, POINTS_LINE, REBOUNDS_LEADER])
		const posted = await questionsOn(game.id)

		expect(shapeCounts(posted)).toEqual({
			team_stat_numeric_guess: 2,
			player_stat_over_under: 2,
			player_game_stat_leader: 1,
		})
		for (const question of posted) {
			expect(question.isOfficial).toBe(true)
			expect(question.resolutionMode).toBe("system")
			expect(question.locksAt.getTime()).toBe(game.startsAt.getTime())
			expect(question.generationKey).not.toBeNull()
		}

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

		await run([TEAM_POINTS, POINTS_LINE, REBOUNDS_LEADER])
		expect(await questionsOn(game.id)).toHaveLength(5)
	})

	it("puts each side's top scorer head to head", async () => {
		const { game } = await seedStandardGame()

		await run([POINTS_DUEL])

		expect(duelPlayers(await questionsOn(game.id))).toEqual([
			"Jalen Brunson",
			"Jayson Tatum",
		])
	})

	it("doesn't ask about a player a duel already asks about in the same stat", async () => {
		const { game } = await seedStandardGame()

		await run([POINTS_DUEL, POINTS_LINE])
		const posted = await questionsOn(game.id)

		expect(duelPlayers(posted)).toEqual(["Jalen Brunson", "Jayson Tatum"])
		// Josh Hart's 10 a game is under the line floor, so the Knicks get none.
		expect(overUnderSubjects(posted)).toEqual(["Jaylen Brown"])
	})

	it("posts no over/under beside a duel when each side has only the one starter", async () => {
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
			seasons: { 2027: nbaSeason(27, 20) },
		})

		await run([POINTS_DUEL, POINTS_LINE])

		expect(shapeCounts(await questionsOn(game.id))).toEqual({
			player_vs_player: 1,
		})
	})

	it("draws a few player templates per game from the catalog, one per stat, the same on a rerun", async () => {
		// A starter at every position with every stat the NBA catalog picks by,
		// so whichever templates the game draws, each one posts.
		const { league, away, home, game } = await seedNbaGame()
		for (const name of ["Assists", "3-Pointers Made", "Blocks"]) {
			await makeStat({ sportId: league.sportId, name })
		}
		const fullSeason = {
			splits: {
				categories: [
					{
						name: "offensive",
						stats: [
							{ name: "points", value: 400 },
							{ name: "assists", value: 120 },
							{ name: "threePointFieldGoalsMade", value: 50 },
						],
					},
					{
						name: "general",
						stats: [
							{ name: "rebounds", value: 160 },
							{ name: "gamesPlayed", value: 20 },
						],
					},
				],
			},
		}
		for (const [t, team] of [away, home].entries()) {
			for (const [i, position] of ["PG", "SG", "SF", "PF", "C"].entries()) {
				const espnId = `${t}${i}`
				const player = await addPlayer(league, team, {
					name: `${team.name} ${position}`,
					espnId,
					seasons: { 2027: fullSeason },
				})
				await db.insert(gameStarters).values({
					gameId: game.id,
					teamId: team.id,
					playerId: player.id,
					role: "starter",
					sortOrder: i + 1,
					playerName: player.name,
					position,
				})
			}
		}

		await run()
		const templateIds = async () =>
			[
				...new Set(
					(await questionsOn(game.id)).flatMap((question) => {
						const parsed = question.generationKey
							? parseGenerationKey(question.generationKey)
							: null
						return parsed && parsed.templateId !== "team-points"
							? [parsed.templateId]
							: []
					}),
				),
			].sort()
		const first = await templateIds()

		expect(first).toHaveLength(PLAYER_QUESTIONS_PER_GAME.nba ?? 0)
		const groups = first.map((id) => {
			const template = catalogTemplate("nba", id)
			return "group" in template ? template.group : id
		})
		expect(new Set(groups).size).toBe(groups.length)

		await run()
		expect(await templateIds()).toEqual(first)
	})

	it("posts only the team guesses before any starters are listed", async () => {
		const { game } = await seedNbaGame()

		await run([TEAM_POINTS, POINTS_DUEL, POINTS_LINE])

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

		await run([TEAM_POINTS, POINTS_LINE, REBOUNDS_LEADER])

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

		await run([POINTS_LINE])

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

		await run([POINTS_LINE])

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Jayson Tatum",
		])
	})

	it("moves a ruled-out starter's uncalled over/under to the next starter up", async () => {
		const { game } = await seedStandardGame()
		await run([POINTS_LINE])

		await markOut("Jayson Tatum")
		await run([POINTS_LINE])

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Jalen Brunson",
			"Jaylen Brown",
		])
	})

	it("moves a ruled-out starter's uncalled duel to the next starter up", async () => {
		const { game } = await seedStandardGame()
		await run([POINTS_DUEL])

		await markOut("Jayson Tatum")
		await run([POINTS_DUEL])
		const posted = await questionsOn(game.id)

		expect(posted).toHaveLength(1)
		expect(duelPlayers(posted)).toEqual(["Jalen Brunson", "Jaylen Brown"])
	})

	it("keeps a called question about a ruled-out starter up beside its replacement", async () => {
		const { game } = await seedStandardGame()
		await run([POINTS_LINE])
		const tatumLine = (await questionsOn(game.id)).find(
			(q) =>
				q.shape === "player_stat_over_under" &&
				q.subjectPlayer?.name === "Jayson Tatum",
		)
		if (!tatumLine) throw new Error("expected a Tatum over/under")
		const caller = await makeUser()
		await makeCall(tatumLine.id, caller.id)

		await markOut("Jayson Tatum")
		await run([POINTS_LINE])

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Jalen Brunson",
			"Jaylen Brown",
			"Jayson Tatum",
		])
	})

	it("asks about a roster batter before the lineup is out, and a lineup batter once it is", async () => {
		await makeUser({ username: OFFICIAL_ACCOUNT_USERNAME })
		const league = await makeLeague({ slug: "mlb" })
		const season = await makeSeason({ leagueId: league.id, year: 2027 })
		await makeStat({ sportId: league.sportId, name: "Hits" })
		const away = await makeTeam({ leagueId: league.id, name: "Mets" })
		const home = await makeTeam({ leagueId: league.id, name: "Yankees" })
		const game = await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			startsAt: hoursFromNow(10),
		})
		await addPlayer(league, away, {
			name: "Francisco Lindor",
			espnId: "11",
			positions: ["SS"],
			seasons: { 2027: mlbBattingSeason(1.5, 100) },
		})
		// A pitcher isn't asked about hits, however many he has.
		await addPlayer(league, away, {
			name: "Kodai Senga",
			espnId: "12",
			positions: ["SP"],
			seasons: { 2027: mlbBattingSeason(3, 100) },
		})
		await addPlayer(league, home, {
			name: "Aaron Judge",
			espnId: "13",
			positions: ["RF", "DH"],
			seasons: { 2027: mlbBattingSeason(1.2, 100) },
		})

		await run([BATTER_HITS], "mlb")
		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Aaron Judge",
			"Francisco Lindor",
		])

		const alonso = await addPlayer(league, away, {
			name: "Pete Alonso",
			espnId: "14",
			positions: ["1B"],
			seasons: { 2027: mlbBattingSeason(1.1, 100) },
		})
		await db.insert(gameStarters).values({
			gameId: game.id,
			teamId: away.id,
			playerId: alonso.id,
			role: "batter",
			sortOrder: 1,
			playerName: "Pete Alonso",
			position: "1B",
		})
		await run([BATTER_HITS], "mlb")

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Aaron Judge",
			"Pete Alonso",
		])
	})
})

describe("syncGameQuestions", () => {
	it("carries every generated question on a moved game to its new start", async () => {
		const { league, game } = await seedStandardGame()
		await run([TEAM_POINTS, POINTS_LINE, REBOUNDS_LEADER])

		const movedTo = hoursFromNow(34)
		await db
			.update(games)
			.set({ startsAt: movedTo })
			.where(eq(games.id, game.id))
		await syncGameQuestions(league)

		const posted = await questionsOn(game.id)
		expect(posted).toHaveLength(6)
		for (const question of posted) {
			expect(question.locksAt.getTime()).toBe(movedTo.getTime())
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

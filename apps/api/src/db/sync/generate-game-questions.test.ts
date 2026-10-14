import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { PRICING_MIN_SAMPLE } from "../../lib/game-questions/duel-pricing"
import { parseGenerationKey } from "../../lib/game-questions/generation-key"
import { LINE_TUNING } from "../../lib/game-questions/line-calibration"
import { LINE_FORMULA } from "../../lib/game-questions/lines"
import { OFFICIAL_ACCOUNT_USERNAME } from "../../lib/official-account"
import {
	HOUR,
	makeCall,
	makeExternalRef,
	makeGame,
	makeLeague,
	makePlayer,
	makeQuestion,
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
	gameStarters,
	games,
	type League,
	type Question,
	questionAutoResolutions,
	type Team,
} from "../schema"
import type { EspnSeasonStatistics } from "./espn-client"
import { generateGameQuestions } from "./generate-game-questions"
import { syncGameQuestions } from "./sync-game-questions"
import { type FakeEspnClient, fakeEspnClient } from "./test-support"

const NOW = new Date("2026-11-10T16:00:00Z")
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR)

const catalogTemplate = (leagueSlug: string, id: string) => {
	const template = GAME_QUESTION_CATALOG[leagueSlug]?.find((t) => t.id === id)
	if (!template) throw new Error(`no ${leagueSlug} template ${id}`)
	return template
}

// The catalog doesn't post team numeric guesses, but the generator still
// can, so its handling of them is held to this one.
const TEAM_POINTS: GameQuestionTemplate = {
	id: "team-points",
	tier: 1,
	shape: "team_stat_numeric_guess",
	statName: "Points",
}
const TEAM_POINTS_LINE = catalogTemplate("nba", "team-points-ou")
const GAME_POINTS_TOTAL = catalogTemplate("nba", "game-points-total")
const POINTS_DUEL = catalogTemplate("nba", "top-scorer-points-duel")
const POINTS_LINE = catalogTemplate("nba", "top-scorer-points")
const REBOUNDS_LEADER = catalogTemplate("nba", "rebounds-leader")
const POINTS_LEADER = catalogTemplate("nba", "points-leader")
const BATTER_HITS = catalogTemplate("mlb", "batter-hits")
const BATTER_RBIS = catalogTemplate("mlb", "batter-rbis")
const HITS_LEADER = catalogTemplate("mlb", "hits-leader")
const STRIKEOUTS_DUEL = catalogTemplate("mlb", "starter-strikeouts-duel")

// With templates, posts exactly those on the league's games, each in a group
// of its own so none is left out. Without, posts what the catalog draws.
const run = (
	templates?: GameQuestionTemplate[],
	leagueSlug = "nba",
	retiredTemplateIds: string[] = [],
) =>
	generateGameQuestions({
		now: NOW,
		spacingMs: 0,
		espn,
		catalog: templates
			? {
					templates: {
						[leagueSlug]: templates.map((template) =>
							"group" in template
								? { ...template, group: template.id }
								: template,
						),
					},
					playerQuestionsPerGame: { [leagueSlug]: templates.length },
					retiredTemplateIds: { [leagueSlug]: retiredTemplateIds },
				}
			: {},
	})

let espn: FakeEspnClient

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

function mlbBattingSeason(
	hitsPerGame: number,
	gamesPlayed: number,
	rbisPerGame = 0,
) {
	return {
		splits: {
			categories: [
				{
					name: "batting",
					stats: [
						{ name: "hits", value: hitsPerGame * gamesPlayed },
						{ name: "RBIs", value: rbisPerGame * gamesPlayed },
						{ name: "gamesPlayed", value: gamesPlayed },
					],
				},
			],
		},
	}
}

function mlbPitchingSeason(strikeoutsPerStart: number, gamesStarted: number) {
	return {
		splits: {
			categories: [
				{
					name: "pitching",
					stats: [
						{ name: "strikeouts", value: strikeoutsPerStart * gamesStarted },
						{ name: "gamesStarted", value: gamesStarted },
					],
				},
			],
		},
	}
}

beforeEach(() => {
	seasonStats = {}
	espn = fakeEspnClient()
	espn.fetchAthleteSeasonStatistics.mockImplementation(
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
		position: player.positions?.[0] ?? null,
		positions: player.positions ?? [],
	})
	await makeExternalRef("player", `${league.slug}:${player.espnId}`, row.id)
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

// `count` resolved generated lines on an over/under template, landing evenly
// from 0.8x to 1.2x their expectation - the spread a duel on the same stat is
// priced from.
async function resolvedLines(
	leagueSlug: string,
	template: GameQuestionTemplate,
	count = LINE_TUNING.minSample,
) {
	const history = await makeLeague({
		slug: `${leagueSlug}-history-${crypto.randomUUID()}`,
	})
	for (let i = 0; i < count; i++) {
		const ratio = count > 1 ? 0.8 + (0.4 * i) / (count - 1) : 1
		const game = await makeGame({ leagueId: history.id, status: "final" })
		const question = await makeQuestion({
			shape: template.shape,
			status: "resolved",
			gameId: game.id,
			ouLine: 9.5,
			generationKey: `${leagueSlug}:${game.id}:${template.id}:subject`,
			lineBasis: {
				seasonMean: 10,
				seasonGames: 20,
				priorMean: null,
				priorGames: 0,
				priorWeight: 10,
				blendedMean: 10,
				expectedMean: 10,
				opponent: null,
				formula: LINE_FORMULA.teamOnly,
				shade: 1,
				line: 9.5,
			},
		})
		await db
			.insert(questionAutoResolutions)
			.values({ questionId: question.id, evidence: { value: 10 * ratio } })
	}
}

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

	it("doesn't ask about a player a duel already asks about", async () => {
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
						return parsed ? [parsed.templateId] : []
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

	// Every team over/under line comes off finished games, so these seed
	// scores rather than ESPN season stats.
	// `allowed` is what each of those opponents scored, which is this team's
	// own scoring allowed - what the other side of a generated line reads.
	const playFinals = (
		league: League,
		seasonId: string,
		team: Team,
		scores: number[],
		allowed = 100,
	) =>
		Promise.all(
			scores.map(async (score, index) =>
				makeGame({
					leagueId: league.id,
					seasonId,
					homeTeamId: team.id,
					awayTeamId: (await makeTeam({ leagueId: league.id })).id,
					startsAt: hoursFromNow(-100 - index),
					status: "final",
					homeScore: score,
					awayScore: allowed,
				}),
			),
		)

	it("sets each team's over/under from its own finished games", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE])

		const posted = await questionsOn(game.id)
		expect(shapeCounts(posted)).toEqual({ team_stat_over_under: 2 })
		const lineFor = (teamId: string) =>
			posted.find((q) => q.subjectTeamId === teamId)?.ouLine
		// Both sides face an opponent that has allowed 100 a game against a
		// league average of 108.5, which pulls each line down from the team's
		// own average of 110 and 124.
		expect(lineFor(away.id)).toBe(107.5)
		expect(lineFor(home.id)).toBe(121.5)
		expect(posted[0]?.options.map((o) => o.label)).toEqual(["Over", "Under"])
	})

	it("titles a team over/under with the team and its line", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE])

		const titles = (await questionsOn(game.id)).map((q) => q.title).sort()
		expect(titles).toEqual([
			"Celtics: over/under 121.5 points",
			"Knicks: over/under 107.5 points",
		])
	})

	// The point of the adjustment: two teams scoring exactly the same get
	// different lines, because one is facing a defense that gives up 130 a
	// game and the other one that gives up 90.
	it("moves a line by the defense the team is facing", async () => {
		const { league, away, home, game } = await seedNbaGame()
		const five = [110, 110, 110, 110, 110]
		await playFinals(league, game.seasonId, away, five, 130)
		await playFinals(league, game.seasonId, home, five, 90)

		await run([TEAM_POINTS_LINE])

		const posted = await questionsOn(game.id)
		const lineFor = (teamId: string) =>
			posted.find((q) => q.subjectTeamId === teamId)?.ouLine
		// League average 110. The Knicks face the stingier side and land under
		// their own average; the Celtics face the leakier one and land over it.
		expect(lineFor(away.id)).toBe(104.5)
		expect(lineFor(home.id)).toBe(115.5)
	})

	// Five games of "they allow 90" is mostly noise, so it moves the line far
	// less than a season of it would - see opponentAdjustment.
	it("trusts a thin opponent sample less than a thick one", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [110, 110, 110, 110, 110])
		await playFinals(league, game.seasonId, home, Array(40).fill(110), 90)

		await run([TEAM_POINTS_LINE])

		const posted = await questionsOn(game.id)
		const basis = posted.find((q) => q.subjectTeamId === away.id)?.lineBasis
		expect(basis?.opponent?.allowedGames).toBe(40)
		// 40 games earn 40/53 of the way from the league average to 90, where
		// five earned only 5/18 of it.
		expect(basis?.opponent?.multiplier).toBeLessThan(0.949)
	})

	it("stands last season's ESPN scoring in while this one is short", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await makeExternalRef("team", `${league.slug}:18`, away.id)
		espn.fetchTeamSeasonStatistics.mockImplementation(
			async (_sportPath, year, espnTeamId) =>
				espnTeamId === "18" && year === 2026 ? nbaSeason(120, 82) : null,
		)
		await playFinals(league, game.seasonId, away, [100, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE])

		const posted = await questionsOn(game.id)
		// Two games at 105 of the ten the blend weights, the other eight from
		// last season's 120: (105 * 2 + 120 * 8) / 10 = 117, then moved by the
		// opponent it's facing.
		expect(posted.find((q) => q.subjectTeamId === away.id)?.ouLine).toBe(114.5)
	})

	it("skips a team too early in the season for a line, keeping its guess", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE, TEAM_POINTS])

		const posted = await questionsOn(game.id)
		expect(shapeCounts(posted)).toEqual({
			team_stat_over_under: 1,
			team_stat_numeric_guess: 2,
		})
		expect(
			posted.find((q) => q.shape === "team_stat_over_under")?.subjectTeamId,
		).toBe(home.id)
	})

	it("posts a team over/under ahead of the guess on the same stat", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE, TEAM_POINTS])

		const posted = (await questionsOn(game.id)).sort(
			(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
		)
		expect(posted.slice(0, 2).map((q) => q.shape)).toEqual([
			"team_stat_over_under",
			"team_stat_over_under",
		])
	})

	it("sets a game total from both teams' expected scores added up", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([TEAM_POINTS_LINE, GAME_POINTS_TOTAL])

		const posted = await questionsOn(game.id)
		expect(shapeCounts(posted)).toEqual({
			team_stat_over_under: 2,
			game_total_over_under: 1,
		})
		const total = posted.find((q) => q.shape === "game_total_over_under")
		const teamExpected = posted
			.filter((q) => q.shape === "team_stat_over_under")
			.reduce((sum, q) => sum + (q.lineBasis?.expectedMean ?? 0), 0)
		// Each side moved by the defense it faces, the same as its own line.
		expect(total?.lineBasis?.expectedMean).toBeCloseTo(teamExpected, 2)
		expect(total?.lineBasis?.formula).toBe(LINE_FORMULA.opponentAdjusted)
		expect(total?.ouLine).toBe(228.5)
		expect(total?.title).toBe("Game total: over/under 228.5 points")
		expect(total?.subjectTeamId).toBeNull()
		expect(total?.options.map((o) => o.label)).toEqual(["Over", "Under"])
	})

	it("reads team lines and the total off the game's score model once there's history for one", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])
		await resolvedLines("nba", TEAM_POINTS_LINE)

		await run([TEAM_POINTS_LINE, GAME_POINTS_TOTAL])

		const posted = await questionsOn(game.id)
		expect(shapeCounts(posted)).toEqual({
			team_stat_over_under: 2,
			game_total_over_under: 1,
		})
		for (const question of posted) {
			// Unshaded: each line sits where the model's own chance of the over
			// is closest to even, and keeps that chance.
			expect(question.lineBasis?.shade).toBeUndefined()
			expect(question.lineBasis?.pOver).toBeGreaterThan(0.4)
			expect(question.lineBasis?.pOver).toBeLessThan(0.6)
			expect(question.lineBasis?.scoringFactor).toBe(1)
		}
		const total = posted.find((q) => q.shape === "game_total_over_under")
		const teamExpected = posted
			.filter((q) => q.shape === "team_stat_over_under")
			.reduce((sum, q) => sum + (q.lineBasis?.expectedMean ?? 0), 0)
		expect(total?.lineBasis?.expectedMean).toBeCloseTo(teamExpected, 2)
	})

	it("posts a game total once, however many times it runs", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110, 120, 110, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([GAME_POINTS_TOTAL])
		await run([GAME_POINTS_TOTAL])

		expect(shapeCounts(await questionsOn(game.id))).toEqual({
			game_total_over_under: 1,
		})
	})

	it("skips a game total while either team is too early for a line", async () => {
		const { league, away, home, game } = await seedNbaGame()
		await playFinals(league, game.seasonId, away, [100, 110])
		await playFinals(league, game.seasonId, home, [120, 130, 128, 122, 120])

		await run([GAME_POINTS_TOTAL])

		expect(await questionsOn(game.id)).toEqual([])
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

	it("replaces an uncalled question from a retired template, leaving who-wins alone", async () => {
		const { league, game } = await seedStandardGame()
		await syncGameQuestions(league, NOW)
		await run([POINTS_LEADER])

		await run([POINTS_DUEL], "nba", [POINTS_LEADER.id])

		expect(shapeCounts(await questionsOn(game.id))).toEqual({
			team_vs_team: 1,
			player_vs_player: 1,
		})
	})

	it("keeps a called question from a retired template up beside its replacement", async () => {
		const { game } = await seedStandardGame()
		await run([POINTS_LEADER])
		const leader = (await questionsOn(game.id)).find(
			(q) => q.shape === "player_game_stat_leader",
		)
		if (!leader) throw new Error("expected a leader question")
		const caller = await makeUser()
		await makeCall(leader.id, caller.id)

		await run([POINTS_DUEL], "nba", [POINTS_LEADER.id])

		expect(shapeCounts(await questionsOn(game.id))).toEqual({
			player_game_stat_leader: 1,
			player_vs_player: 1,
		})
	})

	it("leaves the positions that can't lead the stat out of a leader pool", async () => {
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
		await addPlayer(league, away, {
			name: "Kodai Senga",
			espnId: "12",
			positions: ["SP"],
			seasons: {},
		})
		await addPlayer(league, home, {
			name: "Aaron Judge",
			espnId: "13",
			positions: ["RF", "DH"],
			seasons: { 2027: mlbBattingSeason(1.2, 100) },
		})

		await run([HITS_LEADER], "mlb")

		const leader = (await questionsOn(game.id)).find(
			(q) => q.shape === "player_game_stat_leader",
		)
		expect(leader?.options.map((o) => o.label).sort()).toEqual([
			"Aaron Judge",
			"Francisco Lindor",
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
	describe("a strikeout duel", () => {
		// One listed starting pitcher a side, the way ESPN posts an MLB game.
		async function seedPitchers(
			awaySeason: EspnSeasonStatistics,
			homeSeason: EspnSeasonStatistics,
		) {
			await makeUser({ username: OFFICIAL_ACCOUNT_USERNAME })
			const league = await makeLeague({ slug: "mlb" })
			const season = await makeSeason({ leagueId: league.id, year: 2027 })
			await makeStat({ sportId: league.sportId, name: "Strikeouts (Pitching)" })
			const away = await makeTeam({ leagueId: league.id, name: "White Sox" })
			const home = await makeTeam({ leagueId: league.id, name: "Guardians" })
			const game = await makeGame({
				leagueId: league.id,
				seasonId: season.id,
				homeTeamId: home.id,
				awayTeamId: away.id,
				startsAt: hoursFromNow(10),
			})
			for (const [team, name, espnId, seasons] of [
				[away, "Hagen Smith", "21", { 2027: awaySeason }],
				[home, "Parker Messick", "22", { 2027: homeSeason }],
			] as const) {
				const player = await addPlayer(league, team, {
					name,
					espnId,
					seasons,
				})
				await db.insert(gameStarters).values({
					gameId: game.id,
					teamId: team.id,
					playerId: player.id,
					role: "starting_pitcher",
					sortOrder: 1,
					playerName: name,
					position: "SP",
				})
			}
			return game
		}

		it("puts two starters head to head when their strikeouts are close", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(5, 20),
				mlbPitchingSeason(7, 20),
			)

			await run([STRIKEOUTS_DUEL], "mlb")

			expect(duelPlayers(await questionsOn(game.id))).toEqual([
				"Hagen Smith",
				"Parker Messick",
			])
		})

		it("still posts a clear favorite", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(3.5, 20),
				mlbPitchingSeason(7, 20),
			)

			await run([STRIKEOUTS_DUEL], "mlb")

			expect(duelPlayers(await questionsOn(game.id))).toHaveLength(2)
		})

		it("prices each side off the strikeout over/under's resolved lines", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(5, 20),
				mlbPitchingSeason(7, 20),
			)
			await resolvedLines("mlb", catalogTemplate("mlb", "starter-strikeouts"))

			await run([STRIKEOUTS_DUEL], "mlb")

			const duel = (await questionsOn(game.id)).find(
				(q) => q.shape === "player_vs_player",
			)
			const [smith, messick] = duel?.options ?? []
			expect(smith?.modelHitRate).toBeLessThan(0.5)
			expect(smith?.winMult).toBeGreaterThan(1)
			expect(messick?.winMult).toBe(1)
			expect(messick?.lossRate).toBeGreaterThan(1)
		})

		it("leaves a duel unpriced until its over/under has enough resolved lines", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(5, 20),
				mlbPitchingSeason(7, 20),
			)
			await resolvedLines(
				"mlb",
				catalogTemplate("mlb", "starter-strikeouts"),
				PRICING_MIN_SAMPLE - 1,
			)

			await run([STRIKEOUTS_DUEL], "mlb")

			const duel = (await questionsOn(game.id)).find(
				(q) => q.shape === "player_vs_player",
			)
			for (const option of duel?.options ?? []) {
				expect(option.winMult).toBeNull()
				expect(option.lossRate).toBeNull()
				expect(option.modelHitRate).toBeNull()
			}
		})

		it("prices a duel posted before it could be, until someone calls it", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(5, 20),
				mlbPitchingSeason(7, 20),
			)
			await run([STRIKEOUTS_DUEL], "mlb")
			const duelOptions = async () =>
				(await questionsOn(game.id)).find((q) => q.shape === "player_vs_player")
					?.options ?? []
			expect((await duelOptions()).map((o) => o.winMult)).toEqual([null, null])

			await resolvedLines("mlb", catalogTemplate("mlb", "starter-strikeouts"))
			await run([STRIKEOUTS_DUEL], "mlb")
			const [smith, messick] = await duelOptions()
			expect(smith?.winMult).toBeGreaterThan(1)
			expect(messick?.lossRate).toBeGreaterThan(1)

			const duel = (await questionsOn(game.id)).find(
				(q) => q.shape === "player_vs_player",
			)
			if (!duel) throw new Error("expected a duel")
			await makeCall(duel.id, (await makeUser()).id)
			const called = await duelOptions()
			seasonStats["21"] = { 2027: mlbPitchingSeason(7, 20) }
			await run([STRIKEOUTS_DUEL], "mlb")
			expect(await duelOptions()).toEqual(called)
		})

		it("isn't posted when one side's strikeouts are far behind", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(2.3, 20),
				mlbPitchingSeason(6.5, 20),
			)

			await run([STRIKEOUTS_DUEL], "mlb")

			expect(await questionsOn(game.id)).toEqual([])
		})

		it("isn't posted when one side has no starts on record", async () => {
			const game = await seedPitchers(
				mlbPitchingSeason(1, 0),
				mlbPitchingSeason(7, 20),
			)

			await run([STRIKEOUTS_DUEL], "mlb")

			expect(await questionsOn(game.id)).toEqual([])
		})
	})

	it("asks each batter about one stat at most", async () => {
		await makeUser({ username: OFFICIAL_ACCOUNT_USERNAME })
		const league = await makeLeague({ slug: "mlb" })
		const season = await makeSeason({ leagueId: league.id, year: 2027 })
		await makeStat({ sportId: league.sportId, name: "Hits" })
		await makeStat({ sportId: league.sportId, name: "RBIs" })
		const away = await makeTeam({ leagueId: league.id, name: "Mets" })
		const home = await makeTeam({ leagueId: league.id, name: "Yankees" })
		const game = await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: home.id,
			awayTeamId: away.id,
			startsAt: hoursFromNow(10),
		})
		// One batter a side, so a second stat has nobody left to ask about.
		for (const [team, name, espnId] of [
			[away, "Francisco Lindor", "11"],
			[home, "Aaron Judge", "13"],
		] as const) {
			await addPlayer(league, team, {
				name,
				espnId,
				positions: ["RF"],
				seasons: { 2027: mlbBattingSeason(1.2, 100, 0.8) },
			})
		}

		await run([BATTER_HITS, BATTER_RBIS], "mlb")

		expect(overUnderSubjects(await questionsOn(game.id))).toEqual([
			"Aaron Judge",
			"Francisco Lindor",
		])
	})
})

describe("syncGameQuestions", () => {
	// An upcoming NBA game where each side has played `games` finals against a
	// third team this season, scoring the same number each time.
	async function seedWhoWins(awayScore: number, homeScore: number, games = 12) {
		const seeded = await seedNbaGame(48)
		const { league, away, home, game } = seeded
		const other = await makeTeam({ leagueId: league.id, name: "Nets" })
		for (const [team, score] of [
			[away, awayScore],
			[home, homeScore],
		] as const) {
			await addFinals(league, game.seasonId, team, other, score, games)
		}
		return seeded
	}

	async function addFinals(
		league: League,
		seasonId: string,
		team: Team,
		other: Team,
		score: number,
		count: number,
	) {
		for (let i = 0; i < count; i++) {
			const atHome = i % 2 === 0
			await makeGame({
				leagueId: league.id,
				seasonId,
				homeTeamId: atHome ? team.id : other.id,
				awayTeamId: atHome ? other.id : team.id,
				status: "final",
				startsAt: hoursFromNow(-24 * (i + 1)),
				homeScore: atHome ? score : 100,
				awayScore: atHome ? 100 : score,
			})
		}
	}

	const whoWinsSides = async (gameId: string) =>
		(await questionsOn(gameId))
			.find((q) => q.shape === "team_vs_team")
			?.options.map(({ winMult, lossRate, modelHitRate }) => ({
				winMult,
				lossRate,
				modelHitRate,
			}))

	it("prices each side of who-wins off both teams' scoring", async () => {
		const { league, game } = await seedWhoWins(95, 115)
		await resolvedLines("nba", TEAM_POINTS_LINE)

		await syncGameQuestions(league, NOW, espn)

		const [awaySide, homeSide] = (await whoWinsSides(game.id)) ?? []
		expect(awaySide?.modelHitRate).toBeLessThan(0.5)
		expect(awaySide?.winMult).toBeGreaterThan(1)
		expect(homeSide?.lossRate).toBeGreaterThan(1)
	})

	it("prices who-wins on a later run once it can be", async () => {
		const { league, game } = await seedWhoWins(95, 115)
		await resolvedLines("nba", TEAM_POINTS_LINE, PRICING_MIN_SAMPLE - 1)
		await syncGameQuestions(league, NOW, espn)
		expect(await whoWinsSides(game.id)).toEqual([
			{ winMult: null, lossRate: null, modelHitRate: null },
			{ winMult: null, lossRate: null, modelHitRate: null },
		])

		await resolvedLines("nba", TEAM_POINTS_LINE, 1)
		await syncGameQuestions(league, NOW, espn)

		const [awaySide] = (await whoWinsSides(game.id)) ?? []
		expect(awaySide?.winMult).toBeGreaterThan(1)
	})

	it("keeps who-wins at the price it was called at", async () => {
		const { league, away, game } = await seedWhoWins(95, 115)
		await resolvedLines("nba", TEAM_POINTS_LINE)
		await syncGameQuestions(league, NOW, espn)
		const called = await whoWinsSides(game.id)
		const whoWins = (await questionsOn(game.id)).find(
			(q) => q.shape === "team_vs_team",
		)
		if (!whoWins) throw new Error("expected a who-wins question")
		await makeCall(whoWins.id, (await makeUser()).id)

		const other = await makeTeam({ leagueId: league.id, name: "Nets" })
		await addFinals(league, game.seasonId, away, other, 140, 20)
		await syncGameQuestions(league, NOW, espn)

		expect(await whoWinsSides(game.id)).toEqual(called)
	})

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

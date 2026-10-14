import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import type { Game } from "../../db/schema"
import { questionAutoResolutions, teamGameStats } from "../../db/schema"
import type { EspnClient } from "../../db/sync/espn-client"
import {
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeTeam,
	pastDate,
} from "../../test/factories"
import { PRICING_MIN_SAMPLE } from "./duel-pricing"
import {
	chanceOver,
	createGameScoreModel,
	createGameWinnerPricer,
	type GameScoreModel,
	lineFromDraws,
	POSTSEASON_PRIOR_SD,
	postseasonFactor,
	priceUserTeamLine,
	scoringLevels,
	sideDraws,
	totalDraws,
} from "./game-score-model"
import { LINE_TUNING } from "./line-calibration"
import { LINE_FORMULA, type LineFormula } from "./lines"

const YEAR = 2026

// Spread evenly from 0.8x to 1.2x their expectation.
const evenRatios = (count: number) =>
	Array.from({ length: count }, (_, i) => 0.8 + (0.4 * i) / (count - 1))

// A team's runs in 100 games, as the quantiles of a Poisson around `mean`:
// whole numbers, skewed right, the way a low-scoring stat actually lands.
function poissonScores(mean: number, count = 100): number[] {
	const scores: number[] = []
	for (let i = 0; i < count; i++) {
		const target = (i + 0.5) / count
		let k = 0
		let p = Math.exp(-mean)
		let cumulative = p
		while (cumulative < target) {
			k++
			p *= mean / k
			cumulative += p
		}
		scores.push(k)
	}
	return scores
}

// Past games at a 4.5-run expectation on both sides, paired so the two
// sides' scores aren't sorted together.
function runPairs(count = 100) {
	const scores = poissonScores(4.5, count)
	return scores.map((away, i) => ({
		away: away / 4.5,
		home: (scores[(i * 37) % count] ?? 0) / 4.5,
	}))
}

function modelOf(
	away: number,
	home: number,
	spread: GameScoreModel["spread"],
	edge = { home: 1, away: 1 },
): GameScoreModel {
	const side = (expected: number) => ({
		season: { mean: expected, games: 20 },
		prior: null,
		blended: { mean: expected, games: 20 },
		opponent: null,
		expected,
	})
	return {
		templateId: "team-runs-ou",
		statName: "Runs",
		away: side(away),
		home: side(home),
		formula: LINE_FORMULA.teamOnly,
		priorWeight: 20,
		spread,
		edge,
		scoringFactor: 1,
	}
}

describe("lineFromDraws", () => {
	it("sets the half point closest to an even chance", () => {
		const draws = [1, 2, 2, 3, 3, 3, 4, 4, 5, 6]
		const picked = lineFromDraws(draws, 0.5)
		expect(picked?.line).toBe(3.5)
		expect(picked?.pOver).toBeCloseTo(chanceOver(draws, 3.5), 3)
	})

	// The median is 3, but 3.5 leaves the over at 4 in 10 and 2.5 at 7 in 10:
	// the half above is the closer of the two.
	it("measures both halves around a whole-number median", () => {
		expect(lineFromDraws([1, 2, 3, 3, 3, 3, 4, 5, 6, 7], 0.5)?.line).toBe(3.5)
		expect(lineFromDraws([1, 2, 2, 2, 3, 3, 3, 3, 4, 5], 0.5)?.line).toBe(2.5)
	})

	it("never sets a line under the template's floor", () => {
		expect(lineFromDraws([0, 0, 1, 1, 1, 2], 1.5)?.line).toBe(1.5)
		expect(lineFromDraws([0, 0, 0, 0, 1, 1], 3.5)).toBeNull()
	})
})

describe("a game's lines off one model", () => {
	// The game that showed the old lines disagreeing: team lines of 2.5 and
	// 3.5 beside a total of 8.5, which can't all be coin flips at once.
	it("sets team lines and a total that agree with each other", () => {
		const model = modelOf(3.83, 4.21, { ratios: [], pairs: runPairs() })
		const away = lineFromDraws(sideDraws(model, "away"), 1.5)
		const home = lineFromDraws(sideDraws(model, "home"), 1.5)
		const total = lineFromDraws(totalDraws(model), 3.5)

		for (const picked of [away, home, total]) {
			expect(picked?.pOver).toBeGreaterThan(0.4)
			expect(picked?.pOver).toBeLessThan(0.6)
		}
		// The total sits on both teams' scores added up in the same games, not
		// on a separately shaded sum.
		expect(total?.line).toBeLessThan(8.5)
		expect(total?.line).toBeGreaterThanOrEqual(
			(away?.line ?? 0) + (home?.line ?? 0) - 1,
		)
	})

	it("moves the total with the team lines when both teams are expected to score less", () => {
		const pairs = runPairs()
		const high = modelOf(4.5, 4.5, { ratios: [], pairs })
		const low = modelOf(3.5, 3.5, { ratios: [], pairs })
		const totalOf = (model: GameScoreModel) =>
			lineFromDraws(totalDraws(model), 3.5)?.line ?? 0
		expect(totalOf(low)).toBeLessThan(totalOf(high))
	})

	it("adds every pairing of two past results without enough same-game pairs", () => {
		const model = modelOf(10, 20, { ratios: [0.5, 1, 1.5], pairs: [] })
		expect(totalDraws(model)).toHaveLength(9)
		expect(Math.min(...totalDraws(model))).toBe(15)
		expect(Math.max(...totalDraws(model))).toBe(45)
	})

	it("moves each side by the home edge only without enough same-game pairs", () => {
		const edge = { home: 1.1, away: 0.9 }
		const unpaired = modelOf(10, 10, { ratios: [1], pairs: [] }, edge)
		expect(sideDraws(unpaired, "home")).toEqual([11])
		expect(sideDraws(unpaired, "away")).toEqual([9])
	})
})

describe("postseasonFactor", () => {
	const levels = (postseasonGames: number) => ({
		regularMean: 1,
		regularVariance: 0.5,
		postseasonMean: 0.75,
		postseasonGames,
	})

	it("leaves a season with no postseason games alone", () => {
		expect(postseasonFactor(null)).toBe(1)
		expect(postseasonFactor(levels(0))).toBe(1)
	})

	it("trusts a postseason's own scoring more with every game", () => {
		const few = postseasonFactor(levels(10))
		const many = postseasonFactor(levels(200))
		expect(few).toBeLessThan(1)
		expect(many).toBeLessThan(few)
		expect(many).toBeGreaterThan(0.75)
	})

	// Regressed like an opponent's defense: games against games of noise
	// worth one prior's spread.
	it("weighs games against the league's game-to-game noise", () => {
		const weight = 0.5 / POSTSEASON_PRIOR_SD ** 2
		const trust = 56 / (56 + weight)
		expect(postseasonFactor(levels(56))).toBeCloseTo(1 - 0.25 * trust, 3)
	})
})

// Nothing in these tests reaches ESPN: no team has an ESPN id to fetch last
// season by, and the opponent-adjusted pool is left empty.
const noEspn = {} as EspnClient

// `count` resolved team lines on games of their own, landing evenly from 0.8x
// to 1.2x of their expectation.
async function resolvedTeamLines(
	leagueSlug: string,
	templateId: string,
	count: number,
	formula: LineFormula = LINE_FORMULA.teamOnly,
) {
	const history = await makeLeague({
		slug: `${leagueSlug}-history-${crypto.randomUUID()}`,
	})
	for (const ratio of evenRatios(count)) {
		const game = await makeGame({ leagueId: history.id, status: "final" })
		await resolvedLine(leagueSlug, templateId, game.id, "team", ratio, formula)
	}
}

async function resolvedLine(
	leagueSlug: string,
	templateId: string,
	gameId: string,
	subject: string,
	ratio: number,
	formula: LineFormula = LINE_FORMULA.teamOnly,
) {
	const question = await makeQuestion({
		shape: "team_stat_over_under",
		status: "resolved",
		gameId,
		ouLine: 99.5,
		generationKey: `${leagueSlug}:${gameId}:${templateId}:${subject}`,
		lineBasis: {
			seasonMean: 100,
			seasonGames: 20,
			priorMean: null,
			priorGames: 0,
			priorWeight: 10,
			blendedMean: 100,
			expectedMean: 100,
			opponent: null,
			formula,
			shade: 1,
			line: 99.5,
		},
	})
	await db
		.insert(questionAutoResolutions)
		.values({ questionId: question.id, evidence: { value: 100 * ratio } })
}

// `count` past games, each with the template's line resolved on both teams:
// the home side landing at `homeRatio` of its expectation and the away side
// at `awayRatio`.
async function resolvedPairs(
	leagueSlug: string,
	templateId: string,
	count: number,
	homeRatio: number,
	awayRatio: number,
	seasonType: Game["seasonType"] = "regular",
) {
	const league = await makeLeague({
		slug: `${leagueSlug}-history-${crypto.randomUUID()}`,
	})
	for (let i = 0; i < count; i++) {
		const game = await makeGame({
			leagueId: league.id,
			status: "final",
			seasonType,
			startsAt: pastDate(24 * (i + 1)),
		})
		await resolvedLine(leagueSlug, templateId, game.id, game.homeTeamId, homeRatio)
		await resolvedLine(leagueSlug, templateId, game.id, game.awayTeamId, awayRatio)
	}
}

// An NBA league where the home side has scored `homeScore` and the away side
// `awayScore` in each of `games` finals against a third team, half at home.
async function nbaMatchup(homeScore: number, awayScore: number, games = 12) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id, year: YEAR })
	const home = await makeTeam({ leagueId: league.id })
	const away = await makeTeam({ leagueId: league.id })
	const other = await makeTeam({ leagueId: league.id })
	for (const [team, score] of [
		[home, homeScore],
		[away, awayScore],
	] as const) {
		for (let i = 0; i < games; i++) {
			const atHome = i % 2 === 0
			await makeGame({
				leagueId: league.id,
				seasonId: season.id,
				homeTeamId: atHome ? team.id : other.id,
				awayTeamId: atHome ? other.id : team.id,
				status: "final",
				startsAt: pastDate(24 * (i + 1)),
				homeScore: atHome ? score : 100,
				awayScore: atHome ? 100 : score,
			})
		}
	}
	const game = (seasonType: Game["seasonType"] = "regular") => ({
		awayTeam: away,
		homeTeam: home,
		seasonYear: YEAR,
		seasonId: season.id,
		seasonType,
	})
	return { league, season, home, away, game }
}

describe("createGameWinnerPricer", () => {
	it("raises the weaker side's win and the stronger side's miss, away side first", async () => {
		const { league, game } = await nbaMatchup(115, 95)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const [awaySide, homeSide] = (await price(game())) ?? []
		expect(awaySide?.modelHitRate).toBeLessThan(0.5)
		expect(awaySide?.winMult).toBeGreaterThan(1)
		expect(homeSide?.winMult).toBe(1)
		expect(homeSide?.lossRate).toBeGreaterThan(1)
	})

	it("prices two even sides as a coin flip", async () => {
		const { league, game } = await nbaMatchup(105, 105)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const coinFlip = LOSS_RATE_BY_SHAPE.team_vs_team
		const sides = await price(game())
		expect(sides?.map((side) => side.lossRate)).toEqual([coinFlip, coinFlip])
	})

	it("waits for enough resolved lines", async () => {
		const { league, game } = await nbaMatchup(115, 95)
		await resolvedTeamLines("nba", "team-points-ou", PRICING_MIN_SAMPLE - 1)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		expect(await price(game())).toBeNull()
	})

	it("skips a team short of the template's games", async () => {
		const { league, game } = await nbaMatchup(115, 95, 2)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		expect(await price(game())).toBeNull()
	})

	it("takes the home side's edge from same-game pairs", async () => {
		const { league, game } = await nbaMatchup(105, 105)
		await resolvedPairs("nba", "team-points-ou", LINE_TUNING.minSample, 1.05, 0.95)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const [awaySide, homeSide] = (await price(game())) ?? []
		expect(awaySide?.modelHitRate).toBeLessThan(0.5)
		expect(homeSide?.lossRate).toBeGreaterThan(LOSS_RATE_BY_SHAPE.team_vs_team)
	})
})

describe("createGameScoreModel", () => {
	it("reads its spread from regular-season games only", async () => {
		const { league, game } = await nbaMatchup(105, 105)
		await resolvedPairs("nba", "team-points-ou", LINE_TUNING.minSample, 1, 1)
		await resolvedPairs(
			"nba",
			"team-points-ou",
			LINE_TUNING.minSample,
			0.7,
			0.7,
			"postseason",
		)

		const model = await createGameScoreModel("nba", league.id, noEspn)(game())
		expect(model?.spread.pairs).toHaveLength(LINE_TUNING.minSample)
		for (const pair of model?.spread.pairs ?? []) {
			expect(pair).toEqual({ home: 1, away: 1 })
		}
	})

	it("leaves a regular-season game's expectations at the teams' own scoring", async () => {
		const { league, game } = await nbaMatchup(110, 100)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const model = await createGameScoreModel("nba", league.id, noEspn)(game())
		expect(model?.scoringFactor).toBe(1)
		expect(model?.home.expected).toBeCloseTo(110, 6)
		expect(model?.away.expected).toBeCloseTo(100, 6)
	})

	it("moves a postseason game's expectations by the postseason's scoring so far", async () => {
		const { league, season, home, away, game } = await nbaMatchup(110, 100)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)
		await boxScores(league.id, season.id, home.id, away.id, {
			regular: [100, 104, 96, 102, 98, 100, 106, 94, 100, 101, 99, 100],
			postseason: [88, 84, 90, 86],
		})

		const model = await createGameScoreModel("nba", league.id, noEspn)(
			game("postseason"),
		)
		expect(model?.scoringFactor).toBeLessThan(1)
		expect(model?.scoringFactor).toBeGreaterThan(0.84)
		// The box scores give the opponent-adjusted pool a spread too, so each
		// side is moved by the defense it faces as well.
		const multiplier = model?.home.opponent?.multiplier ?? 1
		expect(model?.home.expected).toBeCloseTo(
			110 * multiplier * (model?.scoringFactor ?? 0),
			6,
		)
	})
})

// Two teams playing each other in every game, both scoring each `regular`
// entry in turn and then each `postseason` one, a day apart and ending a day
// ago.
async function boxScores(
	leagueId: string,
	seasonId: string,
	homeTeamId: string,
	awayTeamId: string,
	scores: { regular: number[]; postseason: number[] },
) {
	const games = [
		...scores.regular.map((score) => ({ score, seasonType: "regular" as const })),
		...scores.postseason.map((score) => ({
			score,
			seasonType: "postseason" as const,
		})),
	]
	for (const [i, { score, seasonType }] of games.entries()) {
		const date = pastDate(24 * (games.length - i))
		const game = await makeGame({
			leagueId,
			seasonId,
			homeTeamId,
			awayTeamId,
			seasonType,
			startsAt: date,
			status: "final",
		})
		for (const [teamId, opponentTeamId, isHome] of [
			[homeTeamId, awayTeamId, true],
			[awayTeamId, homeTeamId, false],
		] as const) {
			await db.insert(teamGameStats).values({
				gameId: game.id,
				source: "espn",
				teamId,
				opponentTeamId,
				isHome,
				gameDate: date,
				seasonId,
				leagueId,
				scope: "final_score",
				statKey: "score",
				valueText: String(score),
				valueNumeric: score,
			})
		}
	}
}

describe("scoringLevels", () => {
	it("compares a season's postseason scoring with its regular season's", async () => {
		const { league, season, home, away } = await nbaMatchup(110, 100)
		await boxScores(league.id, season.id, home.id, away.id, {
			regular: Array(12).fill(100),
			postseason: [80, 80],
		})

		const levels = await scoringLevels(league.id, season.id, new Date())
		expect(levels?.regularMean).toBeCloseTo(1, 6)
		// The second postseason game is measured against an average that
		// already counts the first: 80 / (1280 / 13).
		expect(levels?.postseasonMean).toBeCloseTo((0.8 + 80 / (1280 / 13)) / 2, 6)
		// Both teams in both postseason games.
		expect(levels?.postseasonGames).toBe(4)
	})

	it("has nothing to compare before the postseason starts", async () => {
		const { league, season, home, away } = await nbaMatchup(110, 100)
		await boxScores(league.id, season.id, home.id, away.id, {
			regular: Array(12).fill(100),
			postseason: [],
		})

		expect(await scoringLevels(league.id, season.id, new Date())).toBeNull()
	})
})

describe("priceUserTeamLine", () => {
	const price = (
		leagueId: string,
		game: ReturnType<Awaited<ReturnType<typeof nbaMatchup>>["game"]>,
		ouLine: number,
		statName = "Points",
	) =>
		priceUserTeamLine(
			{
				leagueId,
				statName,
				ouLine,
				subjectTeamId: game.homeTeam.id,
				game,
			},
			noEspn,
		)

	it("prices a line off the game's score model", async () => {
		const { league, game } = await nbaMatchup(110, 100)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const near = await price(league.id, game(), 109.5)
		expect(near?.pricing).toMatchObject({
			templateId: "team-points-ou",
			blendedMean: 110,
			ratioCount: LINE_TUNING.minSample,
		})
		expect(near?.pricing.pOver).toBeCloseTo(0.5, 1)

		const far = await price(league.id, game(), 125.5)
		expect(far?.over.winMult).toBeGreaterThan(1)
		expect(far?.under.lossRate).toBeGreaterThan(1)
	})

	it("leaves a stat the model isn't in to the team's own pricing", async () => {
		const { league, game } = await nbaMatchup(110, 100)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		expect(await price(league.id, game(), 40.5, "Rebounds")).toBeNull()
	})
})

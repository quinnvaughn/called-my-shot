import { LOSS_RATE_BY_SHAPE, SIDE_WIN_MULT_MAX } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { GAME_QUESTION_CATALOG } from "../../db/catalog/game-question-catalog"
import { db } from "../../db"
import { questionAutoResolutions } from "../../db/schema"
import type { EspnClient } from "../../db/sync/espn-client"
import {
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeTeam,
	pastDate,
} from "../../test/factories"
import {
	createGameWinnerPricer,
	PRICING_MIN_SAMPLE,
	playerLineTemplateFor,
	priceDuel,
	withBoxSpread,
} from "./duel-pricing"
import { LINE_TUNING, pairedRatiosForTemplate } from "./line-calibration"
import { LINE_FORMULA, type LineFormula } from "./lines"

const YEAR = 2026

// Spread evenly from 0.8x to 1.2x their expectation.
const evenRatios = (count: number) =>
	Array.from({ length: count }, (_, i) => 0.8 + (0.4 * i) / (count - 1))

// `count` resolved lines' ratios with no same-game pairs among them.
const spreadOf = (count: number) => ({ ratios: evenRatios(count), pairs: [] })

describe("priceDuel", () => {
	it("prices an even duel as a coin flip on both sides", () => {
		const coinFlip = LOSS_RATE_BY_SHAPE.player_vs_player
		const sides = priceDuel(spreadOf(LINE_TUNING.minSample), 20, 20)
		expect(sides?.map((side) => side.lossRate)).toEqual([coinFlip, coinFlip])
		expect(sides?.map((side) => side.winMult)).toEqual([1, 1])
		expect(sides?.[0].modelHitRate).toBeCloseTo(0.5, 2)
	})

	it("raises the underdog's win and the favorite's miss", () => {
		const coinFlip = LOSS_RATE_BY_SHAPE.player_vs_player
		const [underdog, favorite] =
			priceDuel(spreadOf(LINE_TUNING.minSample), 20, 22) ?? []
		expect(underdog?.modelHitRate).toBeLessThan(0.5)
		expect(underdog).toMatchObject({ lossRate: coinFlip })
		expect(underdog?.winMult).toBeGreaterThan(1)
		expect(favorite).toMatchObject({ winMult: 1 })
		expect(favorite?.lossRate).toBeGreaterThan(1)
		expect(
			(underdog?.modelHitRate ?? 0) + (favorite?.modelHitRate ?? 0),
		).toBeCloseTo(1, 2)
	})

	it("prices a long shot past the win cap on its miss", () => {
		const [longShot] = priceDuel(spreadOf(LINE_TUNING.minSample), 15, 24) ?? []
		expect(longShot?.winMult).toBe(SIDE_WIN_MULT_MAX)
		expect(longShot?.lossRate).toBeLessThan(LOSS_RATE_BY_SHAPE.player_vs_player)
	})

	it("prices off same-game pairs once there are enough", () => {
		// Every past game moved both sides together, so the side expected to
		// produce more always did: far likelier than drawing each side from a
		// different game would say.
		const together = evenRatios(LINE_TUNING.minSample).map((ratio) => ({
			home: ratio,
			away: ratio,
		}))
		const ratios = evenRatios(LINE_TUNING.minSample)
		const [pairedAway] = priceDuel({ ratios, pairs: together }, 20, 22) ?? []
		const [separateAway] = priceDuel({ ratios, pairs: [] }, 20, 22) ?? []
		expect(pairedAway?.modelHitRate).toBeLessThan(
			separateAway?.modelHitRate ?? 0,
		)
	})

	it("reads the ratios alone until there are enough pairs", () => {
		const ratios = evenRatios(LINE_TUNING.minSample)
		const few = ratios.slice(0, PRICING_MIN_SAMPLE - 1).map((ratio) => ({ home: ratio, away: ratio }))
		expect(priceDuel({ ratios, pairs: few }, 20, 22)).toEqual(
			priceDuel({ ratios, pairs: [] }, 20, 22),
		)
	})

	it("waits for enough resolved lines", () => {
		expect(priceDuel(spreadOf(PRICING_MIN_SAMPLE - 1), 18, 24)).toBeNull()
	})

	it("can't price two sides expected to produce nothing", () => {
		expect(priceDuel(spreadOf(LINE_TUNING.minSample), 0, 0)).toBeNull()
	})
})

describe("withBoxSpread", () => {
	const lines = (count: number) => spreadOf(count)
	const box = { ratios: evenRatios(200), pairs: [] }

	it("prices from the box scores until the lines are as deep as a line is tuned from", () => {
		expect(withBoxSpread(lines(LINE_TUNING.minSample - 1), box).ratios).toBe(
			box.ratios,
		)
	})

	it("switches to the lines once they are", () => {
		const deep = lines(LINE_TUNING.minSample)
		expect(withBoxSpread(deep, box).ratios).toBe(deep.ratios)
	})

	it("keeps the lines when the box scores are thinner still", () => {
		const thin = lines(5)
		expect(withBoxSpread(thin, { ratios: [1, 1], pairs: [] }).ratios).toBe(
			thin.ratios,
		)
	})
})

describe("playerLineTemplateFor", () => {
	const nba = GAME_QUESTION_CATALOG.nba ?? []

	it("finds the over/under on the stat a duel compares", () => {
		expect(playerLineTemplateFor(nba, "Rebounds")?.id).toBe("big-rebounds")
	})

	it("matches the ESPN figure a duel ranks its players on", () => {
		expect(
			playerLineTemplateFor(nba, "Rebounds", "general.rebounds")?.id,
		).toBe("big-rebounds")
		expect(playerLineTemplateFor(nba, "Rebounds", "offensive.points")).toBeNull()
	})

	it("finds nothing for a stat no over/under asks", () => {
		expect(playerLineTemplateFor(nba, "Steals")).toBeNull()
	})
})

// `count` resolved generated lines on a league's team scoring over/under,
// landing evenly from 0.8x to 1.2x their expectation.
async function resolvedTeamLines(
	leagueSlug: string,
	templateId: string,
	count: number,
	formula: LineFormula = LINE_FORMULA.teamOnly,
) {
	for (const ratio of evenRatios(count)) {
		const question = await makeQuestion({
			shape: "team_stat_over_under",
			status: "resolved",
			ouLine: 99.5,
			generationKey: `${leagueSlug}:game-${crypto.randomUUID()}:${templateId}:team`,
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
	return { league, home, away }
}

// Nothing in these tests reaches ESPN: no team has an ESPN id to fetch last
// season by, and the opponent-adjusted pool is left empty.
const noEspn = {} as EspnClient

describe("createGameWinnerPricer", () => {
	it("raises the weaker side's win and the stronger side's miss, away side first", async () => {
		const { league, home, away } = await nbaMatchup(115, 95)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const [awaySide, homeSide] =
			(await price({ awayTeam: away, homeTeam: home, seasonYear: YEAR })) ?? []
		expect(awaySide?.modelHitRate).toBeLessThan(0.5)
		expect(awaySide?.winMult).toBeGreaterThan(1)
		expect(homeSide?.winMult).toBe(1)
		expect(homeSide?.lossRate).toBeGreaterThan(1)
	})

	it("prices two even sides as a coin flip", async () => {
		const { league, home, away } = await nbaMatchup(105, 105)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const coinFlip = LOSS_RATE_BY_SHAPE.team_vs_team
		const sides = await price({ awayTeam: away, homeTeam: home, seasonYear: YEAR })
		expect(sides?.map((side) => side.lossRate)).toEqual([coinFlip, coinFlip])
	})

	it("waits for enough resolved lines", async () => {
		const { league, home, away } = await nbaMatchup(115, 95)
		await resolvedTeamLines("nba", "team-points-ou", PRICING_MIN_SAMPLE - 1)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		expect(
			await price({ awayTeam: away, homeTeam: home, seasonYear: YEAR }),
		).toBeNull()
	})

	it("skips a team short of the template's games", async () => {
		const { league, home, away } = await nbaMatchup(115, 95, 2)
		await resolvedTeamLines("nba", "team-points-ou", LINE_TUNING.minSample)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		expect(
			await price({ awayTeam: away, homeTeam: home, seasonYear: YEAR }),
		).toBeNull()
	})
})

// `count` past games, each with the template's line resolved on both teams:
// the home side landing at `homeRatio` of its expectation and the away side
// at `awayRatio`.
async function resolvedPairs(
	leagueSlug: string,
	templateId: string,
	count: number,
	homeRatio: number,
	awayRatio: number,
	formula: LineFormula = LINE_FORMULA.teamOnly,
) {
	const league = await makeLeague({ slug: `${leagueSlug}-history` })
	for (let i = 0; i < count; i++) {
		const game = await makeGame({
			leagueId: league.id,
			status: "final",
			startsAt: pastDate(24 * (i + 1)),
		})
		for (const [teamId, ratio] of [
			[game.homeTeamId, homeRatio],
			[game.awayTeamId, awayRatio],
		] as const) {
			const question = await makeQuestion({
				shape: "team_stat_over_under",
				status: "resolved",
				gameId: game.id,
				ouLine: 99.5,
				generationKey: `${leagueSlug}:${game.id}:${templateId}:${teamId}`,
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
	}
}

describe("pairedRatiosForTemplate", () => {
	it("pairs each game's home and away results", async () => {
		await resolvedPairs("nba", "team-points-ou", 3, 1.1, 0.9)

		const pairs = await pairedRatiosForTemplate(
			"nba",
			"team-points-ou",
			LINE_FORMULA.teamOnly,
		)
		expect(pairs).toHaveLength(3)
		for (const pair of pairs) {
			expect(pair.home).toBeCloseTo(1.1, 10)
			expect(pair.away).toBeCloseTo(0.9, 10)
		}
	})

	it("leaves out a game with only one side resolved", async () => {
		await resolvedTeamLines("nba", "team-points-ou", 2)

		expect(
			await pairedRatiosForTemplate(
				"nba",
				"team-points-ou",
				LINE_FORMULA.teamOnly,
			),
		).toEqual([])
	})

	it("keeps each model's pairs apart", async () => {
		await resolvedPairs(
			"nba",
			"team-points-ou",
			2,
			1.1,
			0.9,
			LINE_FORMULA.opponentAdjusted,
		)

		expect(
			await pairedRatiosForTemplate(
				"nba",
				"team-points-ou",
				LINE_FORMULA.teamOnly,
			),
		).toEqual([])
	})
})

describe("createGameWinnerPricer with same-game pairs", () => {
	it("takes the home side's edge from the pairs", async () => {
		const { league, home, away } = await nbaMatchup(105, 105)
		await resolvedPairs("nba", "team-points-ou", LINE_TUNING.minSample, 1.05, 0.95)

		const price = createGameWinnerPricer("nba", league.id, noEspn)
		const [awaySide, homeSide] =
			(await price({ awayTeam: away, homeTeam: home, seasonYear: YEAR })) ?? []
		expect(awaySide?.modelHitRate).toBeLessThan(0.5)
		expect(homeSide?.lossRate).toBeGreaterThan(LOSS_RATE_BY_SHAPE.team_vs_team)
	})
})

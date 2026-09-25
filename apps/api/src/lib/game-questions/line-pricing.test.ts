import { LOSS_RATE_BY_SHAPE } from "@called-my-shot/scoring"
import { describe, expect, it } from "vitest"
import { db } from "../../db"
import { questionAutoResolutions } from "../../db/schema"
import {
	makeGame,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeTeam,
	pastDate,
} from "../../test/factories"
import { LINE_TUNING } from "./line-calibration"
import { priceUserLine } from "./line-pricing"
import { LINE_FORMULA } from "./lines"

const TEMPLATE = "team-points-ou"
const YEAR = 2026

// A league on the nba catalog, with one team that has scored 100 in each of
// `games` finals this season.
async function nbaTeam(games = 12) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({ leagueId: league.id, year: YEAR })
	const team = await makeTeam({ leagueId: league.id })
	for (let i = 0; i < games; i++) {
		await makeGame({
			leagueId: league.id,
			seasonId: season.id,
			homeTeamId: team.id,
			status: "final",
			startsAt: pastDate(24 * (i + 1)),
			homeScore: 100,
			awayScore: 90,
		})
	}
	return { league, team }
}

// `count` resolved generated lines on the template, landing evenly from 0.8x
// to 1.2x their average.
async function resolvedLines(count: number) {
	for (let i = 0; i < count; i++) {
		const ratio = 0.8 + (0.4 * i) / (count - 1)
		const question = await makeQuestion({
			shape: "team_stat_over_under",
			status: "resolved",
			ouLine: 99.5,
			generationKey: `nba:game-${crypto.randomUUID()}:${TEMPLATE}:team`,
			lineBasis: {
				seasonMean: 100,
				seasonGames: 20,
				priorMean: null,
				priorGames: 0,
				priorWeight: 10,
				blendedMean: 100,
				expectedMean: 100,
				opponent: null,
				formula: LINE_FORMULA.teamOnly,
				shade: 1,
				line: 99.5,
			},
		})
		await db
			.insert(questionAutoResolutions)
			.values({ questionId: question.id, evidence: { value: 100 * ratio } })
	}
}

const price = (
	leagueId: string,
	teamId: string,
	ouLine: number,
	statName = "Points",
) =>
	priceUserLine({
		leagueId,
		shape: "team_stat_over_under",
		statName,
		ouLine,
		subjectTeamId: teamId,
		seasonYear: YEAR,
	})

describe("priceUserLine", () => {
	it("makes the long shot cheaper and the likely side dearer on a line far off the model", async () => {
		const { league, team } = await nbaTeam()
		await resolvedLines(LINE_TUNING.minSample)

		const priced = await price(league.id, team.id, 115.5)
		expect(priced?.pricing).toMatchObject({
			templateId: TEMPLATE,
			blendedMean: 100,
			ratioCount: LINE_TUNING.minSample,
		})
		expect(priced?.over).toBeLessThan(1)
		expect(priced?.under).toBeGreaterThan(1)
	})

	it("prices a line near the model as a coin flip on both sides", async () => {
		const { league, team } = await nbaTeam()
		await resolvedLines(LINE_TUNING.minSample)

		const priced = await price(league.id, team.id, 100.5)
		const coinFlip = LOSS_RATE_BY_SHAPE.game_total_over_under
		expect(priced).toMatchObject({ over: coinFlip, under: coinFlip })
	})

	it("waits for enough resolved lines", async () => {
		const { league, team } = await nbaTeam()
		await resolvedLines(LINE_TUNING.minSample - 1)

		expect(await price(league.id, team.id, 115.5)).toBeNull()
	})

	it("skips a stat no template asks about", async () => {
		const { league, team } = await nbaTeam()
		await resolvedLines(LINE_TUNING.minSample)

		expect(await price(league.id, team.id, 5.5, "Rebounds")).toBeNull()
	})

	it("skips a team short of the template's games", async () => {
		const { league, team } = await nbaTeam(2)
		await resolvedLines(LINE_TUNING.minSample)

		expect(await price(league.id, team.id, 115.5)).toBeNull()
	})
})

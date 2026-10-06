import { describe, expect, it } from "vitest"
import { db } from "../db"
import {
	makeLeague,
	makeSeason,
	makeStat,
	makeTeam,
	makeUser,
	pastDate,
} from "../test/factories"
import { generateSeasonQuestions, winTotalLockTime } from "./season-questions"

const DAY_MS = 24 * 60 * 60 * 1000

describe("winTotalLockTime", () => {
	const season = { regularSeasonStartsAt: new Date("2026-09-28T12:00:00Z") }

	it("adds the league's grace window to opening day", () => {
		expect(winTotalLockTime("nhl", season)).toEqual(
			new Date("2026-10-26T12:00:00Z"),
		)
		expect(winTotalLockTime("nba", season)).toEqual(
			new Date("2026-11-09T12:00:00Z"),
		)
	})

	it("locks on opening day for a league without a format entry", () => {
		expect(winTotalLockTime("wnba", season)).toEqual(
			season.regularSeasonStartsAt,
		)
	})
})

describe("generateSeasonQuestions win totals", () => {
	// An NHL league whose regular season opened `daysAgo` days back, with two
	// teams and the Wins stat.
	async function seedNhl(daysAgo: number) {
		const league = await makeLeague({ slug: "nhl" })
		const season = await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: pastDate(24 * daysAgo),
		})
		await makeStat(
			{ sportId: league.sportId, name: "Wins" },
			{ toleranceMode: "absolute", toleranceValue: 4 },
		)
		for (const abbreviation of ["BOS", "TOR"]) {
			await makeTeam({
				leagueId: league.id,
				abbreviation,
				name: abbreviation,
				conference: "East",
				division: "Atlantic Division",
			})
		}
		const user = await makeUser()
		return { league, season, user }
	}

	function generate(leagueId: string, createdBy: string) {
		return generateSeasonQuestions({
			leagueId,
			resolutionSource: "ESPN",
			createdBy,
			templates: [
				{
					shape: "team_season_stat_numeric_guess",
					ballotGroup: "Win Totals",
					statName: "Wins",
					perTeam: true,
				},
			],
		})
	}

	it("still generates them a few days into the season, locking at the end of the grace window", async () => {
		const { league, season, user } = await seedNhl(5)
		await generate(league.id, user.id)

		const questions = await db.query.questions.findMany({
			where: { leagueId: league.id, shape: "team_season_stat_numeric_guess" },
		})
		expect(questions).toHaveLength(2)
		for (const question of questions) {
			expect(question.locksAt).toEqual(
				new Date(season.regularSeasonStartsAt.getTime() + 28 * DAY_MS),
			)
		}
	})

	it("skips them once the grace window has passed", async () => {
		const { league, user } = await seedNhl(30)
		await generate(league.id, user.id)

		const questions = await db.query.questions.findMany({
			where: { leagueId: league.id, shape: "team_season_stat_numeric_guess" },
		})
		expect(questions).toHaveLength(0)
		const ballots = await db.query.ballots.findMany({
			where: { leagueId: league.id },
		})
		expect(ballots).toHaveLength(0)
	})
})

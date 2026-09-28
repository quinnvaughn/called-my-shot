import { beforeEach, describe, expect, it } from "vitest"
import {
	HOUR,
	makeExternalRef,
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSeason,
	makeStat,
	makeTeam,
} from "../../test/factories"
import { espnFixture } from "../../test/helpers"
import { db } from "../index"
import { playerGameStats } from "../schema"
import { autoResolveSeasons } from "./auto-resolve-seasons"
import {
	EspnRequestError,
	type EspnSeasonStatistics,
	type EspnStandingsGroup,
} from "./espn-client"
import {
	autoRowFor,
	type FakeEspnClient,
	fakeEspnClient,
	questionById,
} from "./test-support"

const NOW = new Date("2026-09-12T12:00:00Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR)

let espn: FakeEspnClient
const run = (now = NOW) => autoResolveSeasons({ now, spacingMs: 0, espn })

// The fixtures' NBA season: team "3" won 26, athlete 4869780 scored 948.
async function seedNbaSeason(endedHoursAgo = 72) {
	const league = await makeLeague({ slug: "nba" })
	const season = await makeSeason({
		leagueId: league.id,
		year: 2025,
		regularSeasonStartsAt: hoursAgo(24 * 180),
		regularSeasonEndsAt: hoursAgo(endedHoursAgo),
	})
	const team = await makeTeam({ leagueId: league.id })
	await makeExternalRef("team", "nba:3", team.id)
	return { league, season, team }
}

type Setup = Awaited<ReturnType<typeof seedNbaSeason>>

const seasonQuestion = (setup: Setup) =>
	({
		leagueId: setup.league.id,
		sportId: setup.league.sportId,
		seasonId: setup.season.id,
		statAggregation: "total",
		status: "locked",
		locksAt: hoursAgo(24 * 180),
		resolutionMode: "system",
	}) as const

async function seedWinTotal(setup: Setup) {
	const stat = await makeStat({
		sportId: setup.league.sportId,
		name: "Wins",
		appliesTo: "both",
	})
	return makeQuestion({
		...seasonQuestion(setup),
		shape: "team_season_stat_numeric_guess",
		statId: stat.id,
		subjectTeamId: setup.team.id,
		numericToleranceAbsolute: 3,
	})
}

async function seedPointsLine(
	setup: Setup,
	espnAthleteId: string,
	ouLine: number,
) {
	const stat = await makeStat({
		sportId: setup.league.sportId,
		name: "Points",
		appliesTo: "both",
	})
	const player = await makePlayer({ currentTeamId: setup.team.id })
	await makeExternalRef("player", `nba:${espnAthleteId}`, player.id)
	const question = await makeQuestion({
		...seasonQuestion(setup),
		shape: "player_season_stat_over_under",
		statId: stat.id,
		subjectPlayerId: player.id,
		ouLine,
	})
	const over = await makeOption(question.id, { label: "Over", sortOrder: 0 })
	const under = await makeOption(question.id, { label: "Under", sortOrder: 1 })
	return { question, over, under }
}

beforeEach(() => {
	espn = fakeEspnClient()
})

describe("autoResolveSeasons", () => {
	it("resolves a win total from ESPN's standings once the regular season is over", async () => {
		const setup = await seedNbaSeason()
		const question = await seedWinTotal(setup)
		espn.fetchStandings.mockResolvedValue(
			espnFixture<EspnStandingsGroup>("standings-nba.json"),
		)

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(row?.numericActualValue).toBe(26)
		expect(row?.resolutionMethod).toBe("system")
		expect(row?.resolutionSource).toBe("ESPN regular-season stats")
		expect(row?.resolutionSourceUrl).toBe(
			"https://www.espn.com/nba/standings/_/season/2025",
		)
		expect((await autoRowFor(question.id))?.recheckDueAt).not.toBeNull()
	})

	it("waits for ESPN's numbers to settle after the regular season ends", async () => {
		const setup = await seedNbaSeason(12)
		await seedWinTotal(setup)
		await run()
		expect(espn.fetchStandings).not.toHaveBeenCalled()
	})

	it("waits on a regular-season game still to be played", async () => {
		const setup = await seedNbaSeason()
		await seedWinTotal(setup)
		await makeGame({
			leagueId: setup.league.id,
			seasonId: setup.season.id,
			homeTeamId: setup.team.id,
			status: "scheduled",
			startsAt: hoursAgo(1),
		})
		await run()
		expect(espn.fetchStandings).not.toHaveBeenCalled()
	})

	it("resolves a player's season line from their statistics", async () => {
		const setup = await seedNbaSeason()
		const { question, over } = await seedPointsLine(setup, "4869780", 900.5)
		espn.fetchAthleteSeasonStatistics.mockResolvedValue(
			espnFixture<EspnSeasonStatistics>("season-athlete-nba-4869780.json"),
		)

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("resolved")
		expect(row?.resolutionSourceUrl).toBe(
			"https://www.espn.com/nba/stats/_/season/2025/seasontype/2",
		)
		const correct = (
			await db.query.questionOptions.findMany({
				where: { questionId: question.id },
			})
		)
			.filter((o) => o.isCorrect)
			.map((o) => o.id)
		expect(correct).toEqual([over.id])
	})

	it("voids a player's line when ESPN has no season for them", async () => {
		const setup = await seedNbaSeason()
		const { question } = await seedPointsLine(setup, "4869780", 900.5)
		espn.fetchAthleteSeasonStatistics.mockResolvedValue(null)

		await run()

		const row = await questionById(question.id)
		expect(row?.status).toBe("voided")
		expect(row?.voidedReason).toBe("subject_did_not_play")
	})

	it("retries failed standings, then hands the question to an admin", async () => {
		const setup = await seedNbaSeason()
		const question = await seedWinTotal(setup)
		espn.fetchStandings.mockRejectedValue(new Error("timed out"))

		await run()
		const first = await autoRowFor(question.id)
		expect(first?.failureReason).toBe("fetch_failed")
		expect(first?.escalatedAt).toBeNull()

		// Settled 36 hours after the 72-hours-ago end, plus 48 hours of retries.
		await run(new Date(NOW.getTime() + 13 * HOUR))
		expect((await autoRowFor(question.id))?.escalatedAt).not.toBeNull()
		expect((await questionById(question.id))?.status).toBe("locked")
	})

	it("stops the run when ESPN refuses it", async () => {
		const setup = await seedNbaSeason()
		await seedWinTotal(setup)
		espn.fetchStandings.mockRejectedValue(
			new EspnRequestError("standings", 429),
		)
		await expect(run()).rejects.toBeInstanceOf(EspnRequestError)
	})

	describe("team season leader", () => {
		async function seedMinutesLeader(setup: Setup) {
			const rival = await makeTeam({ leagueId: setup.league.id })
			const stat = await makeStat({
				sportId: setup.league.sportId,
				name: "Minutes",
				appliesTo: "player",
			})
			const starter = await makePlayer({ currentTeamId: setup.team.id })
			const traded = await makePlayer({ currentTeamId: setup.team.id })
			const question = await makeQuestion({
				...seasonQuestion(setup),
				statAggregation: null,
				shape: "player_team_season_stat_leader",
				statId: stat.id,
				subjectTeamId: setup.team.id,
			})
			const starterOption = await makeOption(question.id, {
				label: "Starter",
				playerId: starter.id,
				sortOrder: 0,
			})
			const tradedOption = await makeOption(question.id, {
				label: "Traded",
				playerId: traded.id,
				sortOrder: 1,
			})
			return { rival, starter, traded, question, starterOption, tradedOption }
		}

		async function playedGame(
			setup: Setup,
			opts: {
				homeTeamId: string
				awayTeamId: string
				seasonType?: "regular" | "postseason"
				boxScoreSynced?: boolean
				minutes: { playerId: string; teamId: string; value: number }[]
			},
		) {
			const game = await makeGame({
				leagueId: setup.league.id,
				seasonId: setup.season.id,
				homeTeamId: opts.homeTeamId,
				awayTeamId: opts.awayTeamId,
				seasonType: opts.seasonType ?? "regular",
				status: "final",
				startsAt: hoursAgo(24 * 30),
				boxScoreSyncedAt: opts.boxScoreSynced === false ? null : hoursAgo(1),
			})
			for (const { playerId, teamId, value } of opts.minutes) {
				await db.insert(playerGameStats).values({
					gameId: game.id,
					source: "espn",
					sourceAthleteId: `nba:${playerId}`,
					playerId,
					teamId,
					opponentTeamId:
						teamId === opts.homeTeamId ? opts.awayTeamId : opts.homeTeamId,
					isHome: teamId === opts.homeTeamId,
					gameDate: game.startsAt,
					seasonId: setup.season.id,
					leagueId: setup.league.id,
					statKey: "minutes",
					valueText: String(value),
					valueNumeric: value,
					didNotPlay: false,
				})
			}
			return game
		}

		it("counts only what each player put up for the team, in the regular season", async () => {
			const setup = await seedNbaSeason()
			const { rival, starter, traded, question, starterOption } =
				await seedMinutesLeader(setup)
			await playedGame(setup, {
				homeTeamId: setup.team.id,
				awayTeamId: rival.id,
				minutes: [
					{ playerId: starter.id, teamId: setup.team.id, value: 30 },
					{ playerId: traded.id, teamId: setup.team.id, value: 40 },
				],
			})
			await playedGame(setup, {
				homeTeamId: rival.id,
				awayTeamId: setup.team.id,
				minutes: [
					{ playerId: starter.id, teamId: setup.team.id, value: 20 },
					// After the trade, for the rival: 80 minutes in all, 40 of them here.
					{ playerId: traded.id, teamId: rival.id, value: 40 },
				],
			})
			await playedGame(setup, {
				homeTeamId: setup.team.id,
				awayTeamId: rival.id,
				seasonType: "postseason",
				minutes: [{ playerId: traded.id, teamId: setup.team.id, value: 48 }],
			})

			await run()

			const row = await questionById(question.id)
			expect(row?.status).toBe("resolved")
			expect(row?.resolutionSource).toBe("ESPN regular-season stats")
			const options = await db.query.questionOptions.findMany({
				where: { questionId: question.id },
			})
			expect(options.filter((o) => o.isCorrect).map((o) => o.id)).toEqual([
				starterOption.id,
			])
			expect(
				Object.fromEntries(options.map((o) => [o.label, o.actualValue])),
			).toEqual({ Starter: 50, Traded: 40 })
			expect(espn.fetchAthleteSeasonStatistics).not.toHaveBeenCalled()
		})

		it("waits for a final game whose box score isn't stored yet", async () => {
			const setup = await seedNbaSeason()
			const { rival, starter, question } = await seedMinutesLeader(setup)
			await playedGame(setup, {
				homeTeamId: setup.team.id,
				awayTeamId: rival.id,
				minutes: [{ playerId: starter.id, teamId: setup.team.id, value: 30 }],
			})
			await playedGame(setup, {
				homeTeamId: rival.id,
				awayTeamId: setup.team.id,
				boxScoreSynced: false,
				minutes: [],
			})

			await run()

			expect((await questionById(question.id))?.status).toBe("locked")
			expect(await autoRowFor(question.id)).toMatchObject({
				failureReason: "fetch_failed",
				escalatedAt: null,
			})
		})
	})
})

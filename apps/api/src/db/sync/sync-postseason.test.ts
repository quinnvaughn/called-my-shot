import { beforeEach, describe, expect, it } from "vitest"
import { insertCallInTx } from "../../lib/cast-call"
import { OFFICIAL_ACCOUNT_USERNAME } from "../../lib/official-account"
import { isGameAskable } from "../../lib/postseason/settle"
import {
	HOUR,
	makeExternalRef,
	makeLeague,
	makeQuestion,
	makeSeason,
	makeTeam,
	makeUser,
} from "../../test/factories"
import { db } from "../index"
import type { League, Team } from "../schema"
import type { EspnEvent, EspnPostseasonEvent } from "./espn-client"
import { SYNCED_LEAGUES } from "./leagues"
import { syncGameQuestions } from "./sync-game-questions"
import { syncGames } from "./sync-games"
import { syncSeriesQuestions } from "./sync-series-questions"
import { type FakeEspnClient, fakeEspnClient } from "./test-support"

const MLB = SYNCED_LEAGUES.find((config) => config.leagueSlug === "mlb")
if (!MLB) throw new Error("no mlb sync config")

const NOW = new Date()
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 24 * HOUR)

// One game of a best-of-3 Wild Card Series with Seattle (ESPN "12") at home.
function seriesEvent(
	number: number,
	options: {
		startsAt: Date
		homeWon?: boolean
		ifNecessary?: boolean
		// Whether ESPN has set its start time. An If Necessary game's isn't,
		// until it's needed.
		timeValid?: boolean
	},
): EspnEvent {
	const final = options.homeWon !== undefined
	const score = (won: boolean) =>
		final ? { value: won ? 5 : 2, displayValue: won ? "5" : "2" } : undefined
	return {
		id: `40100${number}`,
		date: options.startsAt.toISOString(),
		seasonType: { type: 3 },
		timeValid: options.timeValid ?? !options.ifNecessary,
		competitions: [
			{
				notes: [
					{
						headline: `ALWC - Game ${number}${options.ifNecessary ? " If Necessary" : ""}`,
					},
				],
				status: {
					type: {
						name: final ? "STATUS_FINAL" : "STATUS_SCHEDULED",
						state: final ? "post" : "pre",
						completed: final,
					},
				},
				competitors: [
					{
						homeAway: "home",
						team: { id: "12" },
						score: score(options.homeWon === true),
					},
					{
						homeAway: "away",
						team: { id: "6" },
						score: score(options.homeWon === false),
					},
				],
			},
		],
	}
}

const scoreboardFor = (events: EspnEvent[]): EspnPostseasonEvent[] =>
	events.map((event) => ({
		id: event.id,
		date: event.date,
		competitions: [
			{
				series: { completed: false, totalCompetitions: 3 },
				status: { type: { name: "STATUS_SCHEDULED", completed: false } },
				competitors: [],
			},
		],
	}))

describe("postseason sync", () => {
	let league: League
	let seattle: Team
	let espn: FakeEspnClient

	const serve = (events: EspnEvent[]) => {
		espn.fetchTeams.mockResolvedValue([
			{
				id: "12",
				abbreviation: "SEA",
				displayName: "Seattle",
				color: "005c5c",
			},
			{ id: "6", abbreviation: "DET", displayName: "Detroit", color: "0c2340" },
		])
		espn.fetchSchedule.mockResolvedValue(events)
		espn.fetchPostseasonDay.mockResolvedValue(scoreboardFor(events))
	}

	beforeEach(async () => {
		await makeUser({ username: OFFICIAL_ACCOUNT_USERNAME })
		league = await makeLeague({ slug: "mlb" })
		seattle = await makeTeam({ leagueId: league.id, name: "Seattle Mariners" })
		const detroit = await makeTeam({
			leagueId: league.id,
			name: "Detroit Tigers",
		})
		await makeExternalRef("team", "mlb:12", seattle.id)
		await makeExternalRef("team", "mlb:6", detroit.id)
		await makeSeason({
			leagueId: league.id,
			regularSeasonStartsAt: daysFromNow(-200),
			regularSeasonEndsAt: daysFromNow(-3),
			postseasonStartsAt: daysFromNow(-1),
			postseasonEndsAt: daysFromNow(30),
		})
		espn = fakeEspnClient()
	})

	it("holds questions off an If Necessary game, then settles the series and drops it", async () => {
		const gameOneStart = daysFromNow(1)
		const schedule = {
			one: { startsAt: gameOneStart },
			two: { startsAt: daysFromNow(2) },
			three: { startsAt: daysFromNow(3), ifNecessary: true },
		}
		serve([
			seriesEvent(1, schedule.one),
			seriesEvent(2, schedule.two),
			seriesEvent(3, schedule.three),
		])
		await syncGames(MLB, league, { now: NOW, espn })
		await syncGameQuestions(league, NOW)
		await syncSeriesQuestions(league, NOW, espn)

		const series = await db.query.postseasonSeries.findFirst({
			where: { leagueId: league.id },
		})
		expect(series).toMatchObject({ round: "ALWC", bestOf: 3 })
		const synced = await db.query.games.findMany({
			where: { seriesId: series?.id },
			orderBy: { seriesGameNumber: "asc" },
		})
		expect(synced.map((g) => [g.seriesGameNumber, g.ifNecessary])).toEqual([
			[1, false],
			[2, false],
			[3, true],
		])
		const [, , gameThree] = synced
		if (!gameThree) throw new Error("game 3 didn't sync")
		expect(gameThree.startTimeTbd).toBe(true)
		expect(await isGameAskable(gameThree)).toBe(false)

		const winnerQuestions = await db.query.questions.findMany({
			where: { shape: "team_vs_team", gameId: { isNotNull: true } },
		})
		expect(winnerQuestions.map((q) => q.title).sort()).toEqual([
			"Who will win Game 1?",
			"Who will win Game 2?",
		])
		expect(winnerQuestions.map((q) => q.gameId).sort()).toEqual(
			synced
				.slice(0, 2)
				.map((g) => g.id)
				.sort(),
		)

		const seriesQuestions = await db.query.questions.findMany({
			where: { seriesId: series?.id },
			with: { options: true },
			orderBy: { createdAt: "asc" },
		})
		expect(seriesQuestions.map((q) => q.title)).toEqual([
			"Who wins the series?",
			"Does the series go all 3 games?",
		])
		for (const question of seriesQuestions) {
			expect(question.gameId).toBeNull()
			expect(question.locksAt.getTime()).toBe(gameOneStart.getTime())
		}

		const onGameThree = await makeQuestion({
			leagueId: league.id,
			seasonId: gameThree.seasonId,
			gameId: gameThree.id,
			shape: "yes_no_prop",
		})

		serve([
			seriesEvent(1, { ...schedule.one, homeWon: true }),
			seriesEvent(2, { ...schedule.two, homeWon: true }),
			seriesEvent(3, schedule.three),
		])
		await syncGames(MLB, league, { now: NOW, espn })

		const decided = await db.query.postseasonSeries.findFirst({
			where: { id: series?.id },
		})
		expect(decided?.winnerTeamId).toBe(seattle.id)
		expect(
			await db.query.games.findFirst({ where: { id: gameThree.id } }),
		).toBeUndefined()
		expect(
			await db.query.questions.findFirst({ where: { id: onGameThree.id } }),
		).toMatchObject({ status: "voided", voidedReason: "game_not_completed" })

		const settled = await db.query.questions.findMany({
			where: { seriesId: series?.id },
			with: { options: true },
			orderBy: { createdAt: "asc" },
		})
		expect(settled.map((q) => q.status)).toEqual(["resolved", "resolved"])
		const [winner, distance] = settled
		expect(winner?.options.find((o) => o.isCorrect)?.teamId).toBe(seattle.id)
		expect(distance?.options.find((o) => o.isCorrect)?.label).toBe("No")
	})

	it("reopens the series questions between games, priced from the series score", async () => {
		const schedule = {
			one: { startsAt: daysFromNow(-0.5), homeWon: true },
			two: { startsAt: daysFromNow(1) },
			three: { startsAt: daysFromNow(2), ifNecessary: true },
		}
		serve([
			seriesEvent(1, schedule.one),
			seriesEvent(2, schedule.two),
			seriesEvent(3, schedule.three),
		])
		await syncGames(MLB, league, { now: NOW, espn })
		await syncSeriesQuestions(league, NOW, espn)

		const series = await db.query.postseasonSeries.findFirst({
			where: { leagueId: league.id },
		})
		const [winner, distance] = await db.query.questions.findMany({
			where: { seriesId: series?.id },
			with: { options: true },
			orderBy: { createdAt: "asc" },
		})
		if (!winner || !distance) throw new Error("series questions not posted")
		// Up 1-0 in a best-of-3 with every game even, Seattle needs one of the
		// next two: 3 in 4. The series goes 3 only if Detroit takes Game 2.
		for (const question of [winner, distance]) {
			expect(question.status).toBe("open")
			expect(question.locksAt.getTime()).toBe(
				schedule.two.startsAt.getTime(),
			)
		}
		expect(
			winner.options.find((o) => o.teamId === seattle.id)?.modelHitRate,
		).toBe(0.75)
		expect(
			distance.options.find((o) => o.label === "Yes")?.modelHitRate,
		).toBe(0.5)

		const caller = await makeUser()
		const seattleSide = winner.options.find((o) => o.teamId === seattle.id)
		if (!seattleSide) throw new Error("no Seattle option")
		const call = await db.transaction((tx) =>
			insertCallInTx(tx, {
				userId: caller.id,
				question: winner,
				data: {
					shape: "team_vs_team",
					questionId: winner.id,
					caseText: "",
					selections: [{ optionId: seattleSide.id, conviction: 100 }],
				},
			}),
		)
		expect(call).toMatchObject({ seriesGamesPlayed: 1, seriesWeight: 0.667 })
		const [selection] = await db.query.callSelections.findMany({
			where: { callId: call.id },
		})
		expect(selection).toMatchObject({
			lossRate: seattleSide.lossRate,
			winMult: seattleSide.winMult,
			modelHitRate: 0.75,
		})

		// Detroit evens it, so Game 3 is played: who wins reopens before it,
		// whether it goes 3 is already settled by Game 3 being needed.
		serve([
			seriesEvent(1, schedule.one),
			seriesEvent(2, { startsAt: daysFromNow(-0.1), homeWon: false }),
			seriesEvent(3, { ...schedule.three, timeValid: true }),
		])
		await syncGames(MLB, league, { now: NOW, espn })
		await syncSeriesQuestions(league, NOW, espn)

		const reopened = await db.query.questions.findFirst({
			where: { id: winner.id },
			with: { options: true },
		})
		expect(reopened?.status).toBe("open")
		expect(reopened?.locksAt.getTime()).toBe(
			schedule.three.startsAt.getTime(),
		)
		expect(
			reopened?.options.find((o) => o.teamId === seattle.id)?.modelHitRate,
		).toBe(0.5)
		const held = await db.query.questions.findFirst({
			where: { id: distance.id },
		})
		expect(held?.locksAt.getTime()).toBe(schedule.two.startsAt.getTime())
		// The call keeps the price it was made at.
		expect(
			await db.query.callSelections.findFirst({
				where: { callId: call.id },
			}),
		).toMatchObject({ modelHitRate: 0.75 })
	})

	it("skips a game whose opponent is still TBD and syncs the rest", async () => {
		const gameOne = seriesEvent(1, { startsAt: daysFromNow(1) })
		const nextRound: EspnEvent = {
			...seriesEvent(1, { startsAt: daysFromNow(5) }),
			id: "401999",
		}
		const [competition] = nextRound.competitions
		if (!competition) throw new Error("no competition")
		nextRound.competitions = [
			{
				...competition,
				notes: [{ headline: "ALDS - Game 1" }],
				competitors: [
					{ homeAway: "home", team: { id: "12" } },
					{ homeAway: "away", team: { id: "-2" } },
				],
			},
		]
		serve([gameOne, nextRound])
		await syncGames(MLB, league, { now: NOW, espn })
		await syncGameQuestions(league, NOW)

		const synced = await db.query.games.findMany({
			where: { leagueId: league.id },
		})
		expect(synced.map((g) => g.postseasonRound)).toEqual(["ALWC"])
		expect(
			await db.query.questions.findMany({ where: { shape: "team_vs_team" } }),
		).toHaveLength(1)
	})

	it("syncs the rest of the schedule past an event that fails, then throws", async () => {
		const broken = seriesEvent(1, { startsAt: daysFromNow(1) })
		const [competition] = broken.competitions
		if (!competition) throw new Error("no competition")
		broken.competitions = [
			{
				...competition,
				competitors: [
					{ homeAway: "home", team: { id: "99" } },
					{ homeAway: "away", team: { id: "6" } },
				],
			},
		]
		serve([
			broken,
			seriesEvent(2, { startsAt: daysFromNow(2) }),
			seriesEvent(3, { startsAt: daysFromNow(3), ifNecessary: true }),
		])

		await expect(syncGames(MLB, league, { now: NOW, espn })).rejects.toThrow(
			"401001",
		)
		const synced = await db.query.games.findMany({
			where: { leagueId: league.id },
			orderBy: { seriesGameNumber: "asc" },
		})
		expect(synced.map((g) => g.seriesGameNumber)).toEqual([2, 3])
		const series = await db.query.postseasonSeries.findFirst({
			where: { leagueId: league.id },
		})
		expect(series?.bestOf).toBe(3)
	})
})

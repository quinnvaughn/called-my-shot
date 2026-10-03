import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"
import { db } from "../db"
import {
	callSelections,
	playerGameStats,
	pointAwards,
	questionOptions,
} from "../db/schema"
import {
	type League,
	makeCall,
	makeGame,
	makeLeague,
	makeOption,
	makePlayer,
	makeQuestion,
	makeSeason,
	makeSelection,
	makeTeam,
	makeUser,
} from "../test/factories"
import {
	buildUserRecord,
	calendarRange,
	loadUserRecordInputs,
} from "./user-record"

let userId: string

beforeEach(async () => {
	userId = (await makeUser()).id
})

// One settled option-shape call. The points land on the selection, leaving
// calls.result_points null, which is how every option shape really scores.
async function optionCall(opts: {
	league: League
	seasonId: string
	gameId: string | null
	points: number
	resolvedAt?: Date
}) {
	const question = await makeQuestion({
		leagueId: opts.league.id,
		seasonId: opts.seasonId,
		gameId: opts.gameId,
		status: "resolved",
		resolvedAt: opts.resolvedAt ?? new Date(),
	})
	const picked = await makeOption(question.id, { label: "Yes", sortOrder: 0 })
	await makeOption(question.id, { label: "No", sortOrder: 1 })
	await db
		.update(questionOptions)
		.set({ isCorrect: opts.points > 0 })
		.where(eq(questionOptions.id, picked.id))
	const call = await makeCall(question.id, userId)
	await makeSelection(call.id, picked.id, 50)
	await db
		.update(callSelections)
		.set({ resultPoints: opts.points })
		.where(eq(callSelections.callId, call.id))
}

describe("calendarRange", () => {
	it("starts on the Sunday weeks-1 before this week's and ends today, ET", () => {
		// Wednesday 2026-09-23, 10pm ET, already Thursday in UTC.
		const range = calendarRange(new Date("2026-09-24T02:00:00Z"), 2)
		expect(range).toEqual({ startDay: "2026-09-13", endDay: "2026-09-23" })
	})

	it("counts a Sunday as the start of its own week", () => {
		const range = calendarRange(new Date("2026-09-20T16:00:00Z"), 1)
		expect(range).toEqual({ startDay: "2026-09-20", endDay: "2026-09-20" })
	})

	it("pages back whole weeks, each page ending the Saturday before the next", () => {
		const now = new Date("2026-09-24T02:00:00Z")
		expect(calendarRange(now, 2, 1)).toEqual({
			startDay: "2026-08-30",
			endDay: "2026-09-12",
		})
		expect(calendarRange(now, 2, 2)).toEqual({
			startDay: "2026-08-16",
			endDay: "2026-08-29",
		})
	})
})

describe("loadUserRecordInputs + buildUserRecord", () => {
	const now = new Date("2026-09-24T16:00:00Z")

	it("puts a call on its game's ET day and links a date league to that day", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		// 11pm ET on the 22nd is the 23rd in UTC.
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			startsAt: new Date("2026-09-23T03:00:00Z"),
		})
		await optionCall({ league, seasonId, gameId: game.id, points: 60 })

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days).toHaveLength(1)
		const day = record.calendar.days[0]
		expect(day?.day).toBe("2026-09-22")
		expect(day?.netPoints).toBe(60)
		expect(day?.leagues[0]?.windowKey).toBe("2026-09-22")
	})

	it("links a week league's day to its week's report card", async () => {
		const league = await makeLeague({ windowType: "week" })
		const seasonId = (await makeSeason({ leagueId: league.id, year: 2026 })).id
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			seasonType: "regular",
			weekNumber: 3,
			startsAt: new Date("2026-09-20T17:00:00Z"),
		})
		await optionCall({ league, seasonId, gameId: game.id, points: -40 })

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days[0]?.leagues[0]?.windowKey).toBe("2026-reg-w3")
	})

	it("places a gameless call on the day it resolved, with no window", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		await optionCall({
			league,
			seasonId,
			gameId: null,
			points: 90,
			resolvedAt: new Date("2026-09-21T15:00:00Z"),
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.calendar.days[0]?.day).toBe("2026-09-21")
		expect(record.calendar.days[0]?.leagues[0]?.windowKey).toBeNull()
	})

	it("pages the calendar back and reports the first day on every page", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		// Noon ET on the 1st, a page and a bit before now.
		const early = await makeGame({
			leagueId: league.id,
			seasonId,
			startsAt: new Date("2026-09-01T16:00:00Z"),
		})
		const recent = await makeGame({
			leagueId: league.id,
			seasonId,
			startsAt: new Date("2026-09-22T16:00:00Z"),
		})
		await optionCall({ league, seasonId, gameId: early.id, points: 30 })
		await optionCall({ league, seasonId, gameId: recent.id, points: 50 })
		const inputs = await loadUserRecordInputs(userId)

		const current = buildUserRecord(inputs, { leagueId: null, weeks: 2, now })
		expect(current.calendar.days.map((day) => day.day)).toEqual([
			"2026-09-22",
		])
		expect(current.calendar.firstDay).toBe("2026-09-01")

		const previous = buildUserRecord(inputs, {
			leagueId: null,
			weeks: 2,
			page: 1,
			now,
		})
		expect(previous.calendar.startDay).toBe("2026-08-30")
		expect(previous.calendar.endDay).toBe("2026-09-12")
		expect(previous.calendar.days.map((day) => day.day)).toEqual([
			"2026-09-01",
		])
		expect(previous.calendar.firstDay).toBe("2026-09-01")
		// The breakdown covers every call whatever page the calendar is on.
		expect(previous.netFromCalls).toBe(80)
	})

	it("adds up to the scope's points: calls net plus bonuses, per league and overall", async () => {
		const nba = await makeLeague({ windowType: "date" })
		const nbaSeason = (await makeSeason({ leagueId: nba.id })).id
		const nfl = await makeLeague({ windowType: "week" })
		const nflSeason = (await makeSeason({ leagueId: nfl.id })).id
		const nbaGame = await makeGame({ leagueId: nba.id, seasonId: nbaSeason })
		await optionCall({
			league: nba,
			seasonId: nbaSeason,
			gameId: nbaGame.id,
			points: 120,
		})
		await optionCall({
			league: nba,
			seasonId: nbaSeason,
			gameId: nbaGame.id,
			points: -50,
		})
		const nflGame = await makeGame({ leagueId: nfl.id, seasonId: nflSeason })
		await optionCall({
			league: nfl,
			seasonId: nflSeason,
			gameId: nflGame.id,
			points: -30,
		})
		await db.insert(pointAwards).values({
			userId,
			leagueId: nba.id,
			seasonId: nbaSeason,
			kind: "sweep",
			scopeKey: "s",
			sourceKey: "u",
			points: 25,
		})

		const inputs = await loadUserRecordInputs(userId)
		const career = buildUserRecord(inputs, { leagueId: null, weeks: 2, now })
		expect(career.netFromCalls).toBe(40)
		expect(career.bonusPoints).toBe(25)
		expect(career.wins).toBe(1)
		expect(career.losses).toBe(2)
		// Best net first.
		expect(
			career.byLeague.map((row) => [row.league.id, row.netPoints]),
		).toEqual([
			[nba.id, 70],
			[nfl.id, -30],
		])

		const nbaOnly = buildUserRecord(inputs, { leagueId: nba.id, weeks: 2, now })
		expect(nbaOnly.netFromCalls).toBe(70)
		expect(nbaOnly.bonusPoints).toBe(25)
		expect(nbaOnly.byLeague).toEqual([])
		expect(nbaOnly.byFamily.reduce((sum, row) => sum + row.netPoints, 0)).toBe(
			70,
		)
	})
})

describe("byTeam", () => {
	const now = new Date("2026-09-24T16:00:00Z")

	// A settled call on a fresh question with one picked option per entry in
	// picks, each scored points / picks.length.
	async function pickCall(opts: {
		league: League
		seasonId: string
		gameId: string | null
		question?: Parameters<typeof makeQuestion>[0]
		picks: { teamId?: string; playerId?: string; label?: string }[]
		points: number
	}) {
		const question = await makeQuestion({
			leagueId: opts.league.id,
			seasonId: opts.seasonId,
			gameId: opts.gameId,
			status: "resolved",
			resolvedAt: new Date(),
			...opts.question,
		})
		const call = await makeCall(question.id, userId)
		for (const [i, pick] of opts.picks.entries()) {
			const option = await makeOption(question.id, {
				label: pick.label ?? `Pick ${i}`,
				sortOrder: i,
				teamId: pick.teamId ?? null,
				playerId: pick.playerId ?? null,
				isCorrect: opts.points > 0,
			})
			await makeSelection(call.id, option.id, 50)
			await db
				.update(callSelections)
				.set({ resultPoints: opts.points / opts.picks.length })
				.where(eq(callSelections.optionId, option.id))
		}
	}

	async function boxScore(opts: {
		league: League
		seasonId: string
		gameId: string
		playerId: string
		teamId: string
		opponentTeamId: string
		gameDate: Date
	}) {
		await db.insert(playerGameStats).values({
			gameId: opts.gameId,
			source: "espn",
			sourceAthleteId: `nba:${opts.playerId}`,
			playerId: opts.playerId,
			teamId: opts.teamId,
			opponentTeamId: opts.opponentTeamId,
			isHome: true,
			gameDate: opts.gameDate,
			seasonId: opts.seasonId,
			leagueId: opts.league.id,
			statKey: "points",
			valueText: "20",
			valueNumeric: 20,
			didNotPlay: false,
		})
	}

	it("puts each call on the one team it's about and adds up to the calls' net", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		const celtics = await makeTeam({ leagueId: league.id, name: "Celtics" })
		const sixers = await makeTeam({ leagueId: league.id, name: "76ers" })
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			homeTeamId: celtics.id,
			awayTeamId: sixers.id,
		})

		// A matchup counts toward the team picked, never the opponent.
		await pickCall({
			league,
			seasonId,
			gameId: game.id,
			question: { shape: "team_vs_team" },
			picks: [{ teamId: sixers.id }],
			points: -40,
		})
		await pickCall({
			league,
			seasonId,
			gameId: game.id,
			question: { shape: "team_stat_over_under", subjectTeamId: celtics.id },
			picks: [{ label: "Over" }],
			points: 30,
		})
		// A game total is about neither team alone.
		await pickCall({
			league,
			seasonId,
			gameId: game.id,
			question: { shape: "game_total_over_under" },
			picks: [{ label: "Under" }],
			points: 100,
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(
			record.byTeam.map((row) => [row.team?.id ?? null, row.netPoints]),
		).toEqual([
			[celtics.id, 30],
			[sixers.id, -40],
			[null, 100],
		])
		expect(record.byTeam.reduce((sum, row) => sum + row.netPoints, 0)).toBe(
			record.netFromCalls,
		)
	})

	it("places a player on the team they played for, not the one they're on now", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		const before = await makeTeam({ leagueId: league.id })
		const after = await makeTeam({ leagueId: league.id })
		const other = await makeTeam({ leagueId: league.id })
		const player = await makePlayer({ currentTeamId: after.id })
		const game = await makeGame({
			leagueId: league.id,
			seasonId,
			homeTeamId: before.id,
			awayTeamId: other.id,
		})
		await boxScore({
			league,
			seasonId,
			gameId: game.id,
			playerId: player.id,
			teamId: before.id,
			opponentTeamId: other.id,
			gameDate: new Date("2026-01-10T00:00:00Z"),
		})

		await pickCall({
			league,
			seasonId,
			gameId: game.id,
			question: {
				shape: "player_stat_over_under",
				subjectPlayerId: player.id,
			},
			picks: [{ label: "Over" }],
			points: 25,
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.byTeam.map((row) => row.team?.id)).toEqual([before.id])
	})

	it("places a season-long player call on their latest team that season", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		const first = await makeTeam({ leagueId: league.id })
		const second = await makeTeam({ leagueId: league.id })
		const other = await makeTeam({ leagueId: league.id })
		const player = await makePlayer({ currentTeamId: null })
		for (const [teamId, gameDate] of [
			[first.id, new Date("2026-01-10T00:00:00Z")],
			[second.id, new Date("2026-03-10T00:00:00Z")],
		] as const) {
			const game = await makeGame({
				leagueId: league.id,
				seasonId,
				homeTeamId: teamId,
				awayTeamId: other.id,
			})
			await boxScore({
				league,
				seasonId,
				gameId: game.id,
				playerId: player.id,
				teamId,
				opponentTeamId: other.id,
				gameDate,
			})
		}

		await pickCall({
			league,
			seasonId,
			gameId: null,
			question: {
				shape: "player_season_stat_over_under",
				subjectPlayerId: player.id,
			},
			picks: [{ label: "Over" }],
			points: 60,
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.byTeam.map((row) => row.team?.id)).toEqual([second.id])
	})

	it("puts picks of players from different teams on no specific team", async () => {
		const league = await makeLeague({ windowType: "date" })
		const seasonId = (await makeSeason({ leagueId: league.id })).id
		const a = await makeTeam({ leagueId: league.id })
		const b = await makeTeam({ leagueId: league.id })
		const playerA = await makePlayer({ currentTeamId: a.id })
		const playerB = await makePlayer({ currentTeamId: b.id })

		await pickCall({
			league,
			seasonId,
			gameId: null,
			question: { shape: "player_award_finalists" },
			picks: [{ playerId: playerA.id }, { playerId: playerB.id }],
			points: 80,
		})

		const record = buildUserRecord(await loadUserRecordInputs(userId), {
			leagueId: null,
			weeks: 2,
			now,
		})
		expect(record.byTeam.map((row) => row.team)).toEqual([null])
	})
})
